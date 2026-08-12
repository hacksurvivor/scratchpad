import AppKit
import SwiftUI

struct VariantCard<Content: View>: View {
    let letter: String
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                Text(letter)
                    .font(.caption.bold())
                    .frame(width: 24, height: 24)
                    .background(.primary.opacity(0.09), in: Circle())
                Text(title).font(.headline)
            }
            Spacer()
            content.frame(maxWidth: .infinity)
            Spacer()
        }
        .padding(24)
        .frame(width: 280, height: 220)
        .background(.background, in: RoundedRectangle(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20)
                .stroke(.primary.opacity(0.10), lineWidth: 1)
        }
    }
}

struct ContactSheet: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Button direction")
                    .font(.system(size: 28, weight: .semibold))
                Text("Compare hierarchy, contrast, and emphasis")
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 18) {
                VariantCard(letter: "A", title: "Quiet") {
                    Button("Continue") {}
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                }
                VariantCard(letter: "B", title: "Primary") {
                    Button("Continue") {}
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                }
                VariantCard(letter: "C", title: "Warm") {
                    Button("Continue") {}
                        .buttonStyle(.borderedProminent)
                        .tint(.orange)
                        .controlSize(.large)
                }
            }
        }
        .padding(34)
        .frame(width: 980, height: 380)
        .background(Color(nsColor: .windowBackgroundColor))
    }
}

@main
struct VisualProbe {
    @MainActor
    static func main() throws {
        guard let output = ProcessInfo.processInfo.environment["VISUAL_OUTPUT"],
              !output.isEmpty else {
            throw NSError(domain: "VisualProbe", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "VISUAL_OUTPUT is required"])
        }

        let app = NSApplication.shared
        app.setActivationPolicy(.regular)

        let window = NSWindow(
            contentRect: NSRect(x: 160, y: 160, width: 980, height: 380),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Visual Scratchpad"
        window.contentView = NSHostingView(rootView: ContactSheet())
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        app.activate(ignoringOtherApps: true)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            let capture = Process()
            capture.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
            capture.arguments = ["-x", "-o", "-l", "\(window.windowNumber)", output]
            do {
                try capture.run()
                capture.waitUntilExit()
            } catch {
                fputs("capture failed: \(error)\n", stderr)
            }
            app.terminate(nil)
        }

        app.run()
    }
}
