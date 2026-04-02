import AVFoundation

enum CompressionError: LocalizedError {
    case noVideoTrack
    case readerFailed(Error?)
    case writerFailed(Error?)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .noVideoTrack: return "No video track found"
        case .readerFailed(let e): return "Reader failed: \(e?.localizedDescription ?? "unknown")"
        case .writerFailed(let e): return "Writer failed: \(e?.localizedDescription ?? "unknown")"
        case .cancelled: return "Compression cancelled"
        }
    }
}

actor VideoCompressor {
    private var isCancelled = false

    func cancel() {
        isCancelled = true
    }

    func compress(
        input: URL,
        settings: CompressionSettings,
        metadata: VideoMetadata,
        progressHandler: @Sendable @escaping (Double, String) -> Void
    ) async throws -> CompressionResult {
        isCancelled = false
        let startTime = CFAbsoluteTimeGetCurrent()

        let asset = AVURLAsset(url: input)

        // Reader
        let reader = try AVAssetReader(asset: asset)

        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        guard let videoTrack = videoTracks.first else {
            throw CompressionError.noVideoTrack
        }

        // Use the encoded (pre-transform) dimensions, not the display dimensions.
        // iPhone portrait video is encoded as e.g. 1920x1080 with a 90° rotation transform.
        let encodedSize = try await videoTrack.load(.naturalSize)
        let transform = try await videoTrack.load(.preferredTransform)
        let isRotated = abs(transform.b) == 1 && abs(transform.c) == 1

        // Calculate output size based on display dimensions (post-transform)
        let displaySize = metadata.naturalSize
        let targetDisplaySize = settings.resolution.outputSize(from: displaySize)

        // Convert back to encoded dimensions (swap if rotated)
        let outW: Int
        let outH: Int
        if isRotated {
            outW = Int(targetDisplaySize.height)
            outH = Int(targetDisplaySize.width)
        } else {
            outW = Int(targetDisplaySize.width)
            outH = Int(targetDisplaySize.height)
        }

        // Bitrate based on actual display pixel count
        let bitrate = BitrateCalculator.bitrate(
            quality: settings.quality,
            outputWidth: Int(targetDisplaySize.width),
            outputHeight: Int(targetDisplaySize.height)
        )

        // Decode at target encoded dimensions (pre-transform)
        let needsScale = outW != Int(encodedSize.width) || outH != Int(encodedSize.height)
        var readerSettings: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
        ]
        if needsScale {
            readerSettings[kCVPixelBufferWidthKey as String] = outW
            readerSettings[kCVPixelBufferHeightKey as String] = outH
        }
        let videoReaderOutput = AVAssetReaderTrackOutput(
            track: videoTrack,
            outputSettings: readerSettings
        )
        videoReaderOutput.alwaysCopiesSampleData = false
        reader.add(videoReaderOutput)

        var audioReaderOutput: AVAssetReaderTrackOutput?
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        if let audioTrack = audioTracks.first {
            let aro = AVAssetReaderTrackOutput(
                track: audioTrack,
                outputSettings: [
                    AVFormatIDKey: kAudioFormatLinearPCM,
                    AVLinearPCMIsFloatKey: false,
                    AVLinearPCMBitDepthKey: 16,
                    AVLinearPCMIsNonInterleaved: false,
                ]
            )
            aro.alwaysCopiesSampleData = false
            reader.add(aro)
            audioReaderOutput = aro
        }

        // Writer
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")

        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)

        let codecType: AVVideoCodecType
        switch settings.codec {
        case .h264: codecType = .h264
        case .h265: codecType = .hevc
        case .av1:  codecType = AVVideoCodecType(rawValue: "av01")
        }

        let videoWriterInput = AVAssetWriterInput(
            mediaType: .video,
            outputSettings: [
                AVVideoCodecKey: codecType,
                AVVideoWidthKey: outW,
                AVVideoHeightKey: outH,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: bitrate,
                    AVVideoExpectedSourceFrameRateKey: Int(metadata.frameRate),
                ],
            ]
        )
        videoWriterInput.expectsMediaDataInRealTime = false
        videoWriterInput.transform = transform

        writer.add(videoWriterInput)

        var audioWriterInput: AVAssetWriterInput?
        if audioReaderOutput != nil {
            let awi = AVAssetWriterInput(
                mediaType: .audio,
                outputSettings: [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVEncoderBitRateKey: 128_000,
                    AVSampleRateKey: metadata.audioSampleRate,
                    AVNumberOfChannelsKey: metadata.audioChannelCount,
                ]
            )
            awi.expectsMediaDataInRealTime = false
            writer.add(awi)
            audioWriterInput = awi
        }

        reader.startReading()
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)

        let totalDuration = metadata.duration

        // Process video
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { [isCancelled = { await self.isCancelled }] in
                await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                    let queue = DispatchQueue(label: "vidcompress.video")
                    var resumed = false
                    videoWriterInput.requestMediaDataWhenReady(on: queue) {
                        while videoWriterInput.isReadyForMoreMediaData {
                            if Task.isCancelled {
                                videoWriterInput.markAsFinished()
                                if !resumed { resumed = true; continuation.resume() }
                                return
                            }
                            guard let sampleBuffer = videoReaderOutput.copyNextSampleBuffer() else {
                                videoWriterInput.markAsFinished()
                                if !resumed { resumed = true; continuation.resume() }
                                return
                            }
                            let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
                            let progress = min(pts.seconds / max(totalDuration, 0.001), 0.99)
                            progressHandler(progress, String(format: "Encoding… %.0f%%", progress * 100))
                            videoWriterInput.append(sampleBuffer)
                        }
                    }
                }
            }

            if let awi = audioWriterInput, let aro = audioReaderOutput {
                group.addTask {
                    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                        let queue = DispatchQueue(label: "vidcompress.audio")
                        var resumed = false
                        awi.requestMediaDataWhenReady(on: queue) {
                            while awi.isReadyForMoreMediaData {
                                guard let sampleBuffer = aro.copyNextSampleBuffer() else {
                                    awi.markAsFinished()
                                    if !resumed { resumed = true; continuation.resume() }
                                    return
                                }
                                awi.append(sampleBuffer)
                            }
                        }
                    }
                }
            }

            try await group.waitForAll()
        }

        if isCancelled {
            reader.cancelReading()
            writer.cancelWriting()
            try? FileManager.default.removeItem(at: outputURL)
            throw CompressionError.cancelled
        }

        guard reader.status != .failed else {
            throw CompressionError.readerFailed(reader.error)
        }

        await writer.finishWriting()

        guard writer.status == .completed else {
            throw CompressionError.writerFailed(writer.error)
        }

        progressHandler(1.0, "Complete!")

        let attrs = try FileManager.default.attributesOfItem(atPath: outputURL.path)
        let outputFileSize = attrs[.size] as? Int64 ?? 0
        let elapsed = CFAbsoluteTimeGetCurrent() - startTime

        return CompressionResult(
            outputURL: outputURL,
            outputSize: outputFileSize,
            inputSize: metadata.fileSize,
            elapsedTime: elapsed,
            videoDuration: metadata.duration
        )
    }
}
