import PhotosUI
import SwiftUI

struct VideoPickerView: UIViewControllerRepresentable {
    let onPick: (URL) -> Void
    @Environment(\.dismiss) private var dismiss

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
        Coordinator(onPick: onPick, dismiss: dismiss)
    }

    class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let onPick: (URL) -> Void
        let dismiss: DismissAction

        init(onPick: @escaping (URL) -> Void, dismiss: DismissAction) {
            self.onPick = onPick
            self.dismiss = dismiss
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            dismiss()
            guard let item = results.first else { return }
            let movieType = UTType.movie.identifier

            if item.itemProvider.hasItemConformingToTypeIdentifier(movieType) {
                item.itemProvider.loadFileRepresentation(forTypeIdentifier: movieType) { [onPick] url, error in
                    guard let url = url else { return }
                    // Copy to temp — PHPicker URL is ephemeral
                    let dest = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString)
                        .appendingPathExtension(url.pathExtension)
                    do {
                        try FileManager.default.copyItem(at: url, to: dest)
                        DispatchQueue.main.async { onPick(dest) }
                    } catch {
                        print("Failed to copy picked video: \(error)")
                    }
                }
            }
        }
    }
}
