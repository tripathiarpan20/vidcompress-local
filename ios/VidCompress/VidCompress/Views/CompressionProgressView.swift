import SwiftUI

struct CompressionProgressView: View {
    @EnvironmentObject var vm: CompressorViewModel

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text(vm.progressMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(Int(vm.progress * 100))%")
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(.systemGray5))
                    Capsule()
                        .fill(Color.indigo)
                        .frame(width: geo.size.width * vm.progress)
                        .animation(.linear(duration: 0.15), value: vm.progress)
                }
            }
            .frame(height: 6)

            Button("Cancel", role: .destructive) {
                vm.cancelCompression()
            }
            .font(.subheadline)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
