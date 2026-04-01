import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var vm: CompressorViewModel

    var body: some View {
        VStack(spacing: 16) {
            Text("SETTINGS")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            // Codec
            VStack(alignment: .leading, spacing: 6) {
                Text("Codec").font(.subheadline.weight(.medium))
                Picker("Codec", selection: $vm.settings.codec) {
                    ForEach(Codec.allCases) { codec in
                        HStack {
                            Text(codec.label)
                            if vm.codecAvailability[codec] == false {
                                Text("(N/A)")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .tag(codec)
                    }
                }
                .pickerStyle(.segmented)
            }

            // Resolution
            VStack(alignment: .leading, spacing: 6) {
                Text("Resolution").font(.subheadline.weight(.medium))
                Picker("Resolution", selection: $vm.settings.resolution) {
                    ForEach(Resolution.allCases) { res in
                        Text(res.label).tag(res)
                    }
                }
                .pickerStyle(.segmented)
            }

            // Quality
            VStack(spacing: 4) {
                HStack {
                    Text("Quality").font(.subheadline.weight(.medium))
                    Spacer()
                    Text("\(vm.settings.quality)")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 8) {
                    Text("Smaller")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Slider(
                        value: Binding(
                            get: { Double(vm.settings.quality) },
                            set: { vm.settings.quality = Int($0) }
                        ),
                        in: 1...100,
                        step: 1
                    )
                    .tint(.indigo)
                    Text("Better")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            // Compress button
            Button {
                Task { await vm.startCompression() }
            } label: {
                Label("Compress", systemImage: "bolt.fill")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(.indigo)
            .disabled(vm.phase == .compressing || vm.codecAvailability[vm.settings.codec] == false)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
