import AVFoundation
import VideoToolbox

enum CodecAvailability {
    static func check() -> [Codec: Bool] {
        var result: [Codec: Bool] = [:]
        for codec in Codec.allCases {
            result[codec] = isAvailable(codec)
        }
        return result
    }

    static func isAvailable(_ codec: Codec) -> Bool {
        switch codec {
        case .h264, .h265:
            return true
        case .av1:
            return checkAV1EncoderAvailable()
        }
    }

    private static func checkAV1EncoderAvailable() -> Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        if #available(iOS 17.0, *) {
            let testURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("av1_check.mp4")
            defer { try? FileManager.default.removeItem(at: testURL) }
            guard let writer = try? AVAssetWriter(outputURL: testURL, fileType: .mp4) else {
                return false
            }
            let settings: [String: Any] = [
                AVVideoCodecKey: AVVideoCodecType(rawValue: "av01"),
                AVVideoWidthKey: 1920,
                AVVideoHeightKey: 1080,
            ]
            let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
            return writer.canAdd(input)
        }
        return false
        #endif
    }
}
