import SwiftUI

struct ResultView: View {
    @EnvironmentObject var vm: CompressorViewModel

    var body: some View {
        if let result = vm.result {
            VStack(spacing: 16) {
                Text("RESULT")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                HStack(spacing: 0) {
                    statColumn("Output", FormatHelpers.formatBytes(result.outputSize))
                    statColumn("Reduced", String(format: "%.1f%%", result.reductionPercent))
                    statColumn("Speed", String(format: "%.1fx", result.speed))
                    statColumn("Time", String(format: "%.1fs", result.elapsedTime))
                }

                HStack(spacing: 12) {
                    ShareLink(item: result.outputURL) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)

                    Button {
                        vm.reset()
                    } label: {
                        Label("New", systemImage: "arrow.counterclockwise")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding()
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func statColumn(_ title: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.subheadline.weight(.semibold).monospacedDigit())
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
