import PhotosUI
import SwiftUI

struct VideoPickerView: UIViewControllerRepresentable {
    let onPick: (URL) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var vm: CompressorViewModel

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration()
        config.filter = .videos
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick, dismiss: dismiss, vm: vm)
    }

    class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let onPick: (URL) -> Void
        let dismiss: DismissAction
        let vm: CompressorViewModel

        init(onPick: @escaping (URL) -> Void, dismiss: DismissAction, vm: CompressorViewModel) {
            self.onPick = onPick
            self.dismiss = dismiss
            self.vm = vm
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            dismiss()
            guard let item = results.first else { return }
            let movieType = UTType.movie.identifier

            if item.itemProvider.hasItemConformingToTypeIdentifier(movieType) {
                // Show importing state immediately
                Task { @MainActor in
                    vm.isImporting = true
                }

                item.itemProvider.loadFileRepresentation(forTypeIdentifier: movieType) { [onPick] url, error in
                    guard let url = url else {
                        Task { @MainActor [vm = self.vm] in vm.isImporting = false }
                        return
                    }
                    let dest = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString)
                        .appendingPathExtension(url.pathExtension)
                    do {
                        try FileManager.default.copyItem(at: url, to: dest)
                        DispatchQueue.main.async { onPick(dest) }
                    } catch {
                        Task { @MainActor [vm = self.vm] in vm.isImporting = false }
                        print("Failed to copy picked video: \(error)")
                    }
                }
            }
        }
    }
}
