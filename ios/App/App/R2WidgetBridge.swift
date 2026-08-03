import Foundation
import Capacitor
import WidgetKit

/// The one piece of glue the home-screen widget needs.
///
/// A widget extension is a separate process with its own container: it cannot
/// see the WKWebView's cookies, so it can't authenticate the way the app does.
/// The app already mints a signed, read-only widget token (`/api/widget/token`,
/// see lib/widgetToken.ts) — this plugin drops that token into the shared App
/// Group so the extension can read it and call `/api/widget/today` on its own.
///
/// `@capacitor/preferences` looks like it would do this, but its `group` option
/// is only a key prefix on `UserDefaults.standard`; it never touches a suite,
/// so an extension can't see anything it writes. Hence the custom plugin.
@objc(R2WidgetBridge)
public class R2WidgetBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "R2WidgetBridge"
    public let jsName = "R2WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    /// Must match the App Group on BOTH targets and the one R2FitStore uses.
    static let appGroup = "group.com.richienv.r2fit"

    @objc func save(_ call: CAPPluginCall) {
        guard let store = UserDefaults(suiteName: R2WidgetBridge.appGroup) else {
            call.reject("app-group-unavailable")
            return
        }
        if let token = call.getString("token"), !token.isEmpty {
            store.set(token, forKey: "widgetToken")
        }
        if let base = call.getString("apiBase"), !base.isEmpty {
            store.set(base, forKey: "apiBase")
        }
        // Targets move with the day (gym day vs rest day), so the app pushes
        // them alongside the token rather than the widget guessing.
        if let kcal = call.getInt("kcalTarget"), kcal > 0 {
            store.set(kcal, forKey: "kcalTarget")
        }
        if let protein = call.getInt("proteinTarget"), protein > 0 {
            store.set(protein, forKey: "proteinTarget")
        }
        store.set(Date().timeIntervalSince1970, forKey: "savedAt")

        // Without this the widget keeps its old timeline until iOS decides to
        // refresh it, which can be a good half hour after logging a meal.
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve(["ok": true])
    }

    /// Called on logout. Leaving a valid token behind would keep the previous
    /// account's calories on the home screen after someone else signs in.
    @objc func clear(_ call: CAPPluginCall) {
        guard let store = UserDefaults(suiteName: R2WidgetBridge.appGroup) else {
            call.reject("app-group-unavailable")
            return
        }
        for key in ["widgetToken", "apiBase", "kcalTarget", "proteinTarget", "savedAt"] {
            store.removeObject(forKey: key)
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve(["ok": true])
    }
}
