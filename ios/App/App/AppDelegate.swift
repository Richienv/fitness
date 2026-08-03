import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    /// Where the widget tap / quick action wants to go, held until the web view
    /// is actually up. See `deliver(path:)`.
    private var pendingPath: String?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Cold launch from a long-press quick action: iOS hands the item here
        // instead of calling performActionFor, so it has to be picked up twice.
        if let item = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem {
            route(shortcut: item)
        }
        return true
    }

    // MARK: - Home-screen quick actions (long-press the icon)

    func application(_ application: UIApplication,
                     performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        route(shortcut: shortcutItem)
        completionHandler(true)
    }

    private func route(shortcut: UIApplicationShortcutItem) {
        // The path lives in the Info.plist entry, so adding an action is a
        // plist edit rather than a Swift change.
        let path = (shortcut.userInfo?["path"] as? String) ?? "/"
        deliver(path: path)
    }

    // MARK: - Deep links (r2fit://meal?add=1 — what the widget opens)

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if url.scheme == "r2fit" {
            // r2fit://meal?add=1  →  host "meal", path "", query "add=1"
            var path = "/" + (url.host ?? "")
            if !url.path.isEmpty { path += url.path }
            if let q = url.query, !q.isEmpty { path += "?" + q }
            deliver(path: path)
            return true
        }
        // Keep this call so @capacitor/app can report app URL opens.
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Navigating the web view

    /// The app is a WKWebView pointed at the deployment, so "navigate" means
    /// running a location change inside it. On a cold launch the view isn't
    /// loaded yet and evaluating JavaScript silently does nothing — so poll
    /// briefly for a real page instead of firing once and hoping. Bounded at
    /// ~5s; if the site never loads there is nothing useful to navigate to.
    private func deliver(path: String, attempt: Int = 0) {
        pendingPath = path
        guard attempt < 20 else { pendingPath = nil; return }

        let webView = (window?.rootViewController as? CAPBridgeViewController)?.webView
        let ready = webView?.url?.scheme?.hasPrefix("http") == true && !(webView?.isLoading ?? true)

        if let webView, ready {
            pendingPath = nil
            let escaped = path
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            webView.evaluateJavaScript("window.location.assign('\(escaped)')", completionHandler: nil)
            return
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self, self.pendingPath == path else { return }
            self.deliver(path: path, attempt: attempt + 1)
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}
}
