import AVKit
import SwiftUI

struct InputPreviewView: View {
    @EnvironmentObject var vm: CompressorViewModel
    @State private var player: AVPlayer?

    var body: some View {
        if let meta = vm.metadata {
            VStack(spacing: 12) {
                Text("INPUT")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                if let player = player {
                    VideoPlayer(player: player)
                        .aspectRatio(meta.naturalSize, contentMode: .fit)
                        .frame(maxHeight: 300)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                HStack(spacing: 16) {
                    infoBadge(icon: "rectangle.3.group", text: FormatHelpers.formatDimensions(meta.naturalSize))
                    infoBadge(icon: "clock", text: FormatHelpers.formatDuration(meta.duration))
                    infoBadge(icon: "doc", text: FormatHelpers.formatBytes(meta.fileSize))
                }
            }
            .padding()
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .onAppear {
                if player == nil, let url = vm.inputURL {
                    player = AVPlayer(url: url)
                }
            }
            .onChange(of: vm.inputURL) { _ in
                if let url = vm.inputURL {
                    player = AVPlayer(url: url)
                }
            }
        }
    }

    private func infoBadge(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
            Text(text)
                .font(.caption)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(.tertiarySystemBackground))
        .clipShape(Capsule())
    }
}
