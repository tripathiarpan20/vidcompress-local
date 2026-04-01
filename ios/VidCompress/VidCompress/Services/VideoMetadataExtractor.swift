import AVFoundation

enum VideoMetadataExtractor {
    static func extract(from url: URL) async throws -> VideoMetadata {
        let asset = AVURLAsset(url: url)

        let duration = try await asset.load(.duration)
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        guard let videoTrack = videoTracks.first else {
            throw CompressionError.noVideoTrack
        }

        let naturalSize = try await videoTrack.load(.naturalSize)
        let transform = try await videoTrack.load(.preferredTransform)
        let frameRate = try await videoTrack.load(.nominalFrameRate)

        // Apply transform to get orientation-corrected dimensions
        let transformed = naturalSize.applying(transform)
        let correctedSize = CGSize(
            width: abs(transformed.width),
            height: abs(transformed.height)
        )

        let fileSize: Int64
        let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
        fileSize = attrs[.size] as? Int64 ?? 0

        // Audio info
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        var hasAudio = false
        var channelCount = 0
        var sampleRate: Float64 = 0

        if let audioTrack = audioTracks.first {
            hasAudio = true
            let descriptions = try await audioTrack.load(.formatDescriptions)
            if let desc = descriptions.first {
                let basicDesc = CMAudioFormatDescriptionGetStreamBasicDescription(desc)
                if let asbd = basicDesc?.pointee {
                    channelCount = Int(asbd.mChannelsPerFrame)
                    sampleRate = asbd.mSampleRate
                }
            }
            if channelCount == 0 { channelCount = 2 }
            if sampleRate == 0 { sampleRate = 44100 }
        }

        return VideoMetadata(
            url: url,
            duration: duration.seconds,
            naturalSize: correctedSize,
            fileSize: fileSize,
            hasAudio: hasAudio,
            audioChannelCount: channelCount,
            audioSampleRate: sampleRate,
            frameRate: frameRate > 0 ? frameRate : 30
        )
    }
}
