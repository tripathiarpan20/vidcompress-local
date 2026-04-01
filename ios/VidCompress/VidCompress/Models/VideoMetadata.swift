import Foundation
import CoreGraphics

struct VideoMetadata {
    let url: URL
    let duration: TimeInterval
    let naturalSize: CGSize
    let fileSize: Int64
    let hasAudio: Bool
    let audioChannelCount: Int
    let audioSampleRate: Float64
    let frameRate: Float
}
