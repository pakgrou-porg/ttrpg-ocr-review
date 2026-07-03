import { useState } from "react";
import { LoadView } from "./pages/LoadView";
import { SettingsView } from "./pages/SettingsView";
import { CompareView } from "./pages/CompareView";

type View = { name: "load" } | { name: "settings" } | { name: "compare"; docId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: "load" });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {view.name !== "compare" && (
        <nav className="flex items-center gap-4 border-b border-slate-800 px-4 py-2 text-sm">
          <button
            type="button"
            onClick={() => setView({ name: "load" })}
            className="font-medium hover:text-indigo-400"
          >
            Documents
          </button>
          <button type="button" onClick={() => setView({ name: "settings" })} className="hover:text-indigo-400">
            Settings
          </button>
        </nav>
      )}
      {view.name === "load" && <LoadView onOpen={(docId) => setView({ name: "compare", docId })} />}
      {view.name === "settings" && <SettingsView />}
      {view.name === "compare" && <CompareView docId={view.docId} onBack={() => setView({ name: "load" })} />}
    </div>
  );
}
