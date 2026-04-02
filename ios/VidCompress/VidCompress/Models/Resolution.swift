import Foundation

enum Resolution: String, CaseIterable, Identifiable {
    case original
    case p2160 = "2160p"
    case p1440 = "1440p"
    case p1080 = "1080p"
    case p720  = "720p"
    case p480  = "480p"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .original: return "Original"
        default: return rawValue
        }
    }

    var targetHeight: Int? {
        switch self {
        case .original: return nil
        case .p2160: return 2160
        case .p1440: return 1440
        case .p1080: return 1080
        case .p720:  return 720
        case .p480:  return 480
        }
    }

    func outputSize(from naturalSize: CGSize) -> CGSize {
        guard let targetH = targetHeight else {
            return evenAligned(naturalSize)
        }
        let srcW = naturalSize.width
        let srcH = naturalSize.height
        guard srcH > CGFloat(targetH) else {
            return evenAligned(naturalSize)
        }
        let scaledW = (srcW * CGFloat(targetH)) / srcH
        return evenAligned(CGSize(width: scaledW, height: CGFloat(targetH)))
    }

    private func evenAligned(_ size: CGSize) -> CGSize {
        let w = Int(round(size.width / 2.0)) * 2
        let h = Int(round(size.height / 2.0)) * 2
        return CGSize(width: max(w, 2), height: max(h, 2))
    }
}
