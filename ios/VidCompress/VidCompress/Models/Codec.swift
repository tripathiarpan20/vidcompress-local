import AVFoundation

enum Codec: String, CaseIterable, Identifiable {
    case h264
    case h265
    case av1

    var id: String { rawValue }

    var label: String {
        switch self {
        case .h264: return "H.264 (AVC)"
        case .h265: return "H.265 (HEVC)"
        case .av1:  return "AV1"
        }
    }

    var avCodecType: AVVideoCodecType {
        switch self {
        case .h264: return .h264
        case .h265: return .hevc
        case .av1:  return AVVideoCodecType(rawValue: "apch") // Placeholder — AV1 checked at runtime
        }
    }

    var fileExtension: String { "mp4" }
    var mimeType: String { "video/mp4" }
}
