import { useEffect } from "react";
import { formatDay } from "@freenotes/core";
import { useFreenotes } from "./lib/use-freenotes.js";
import { useSession } from "./lib/use-session.js";
import { Capture } from "./screens/Capture.js";
import { NoteDetail, NotesList } from "./screens/Notes.js";
import { PlanDetail, PlanList } from "./screens/Plan.js";
import { Review } from "./screens/Review.js";
import { Settings } from "./screens/Settings.js";
import { Today } from "./screens/Today.js";
import { Icon } from "./ui/Icon.js";
import { useRoute } from "./ui/router.js";
import { TabBar, TopBar } from "./ui/Shell.js";

export function App() {
  const session = useSession();
  const state = useFreenotes(session);
  const { route, navigate, back } = useRoute();
  const ws = state.workspace;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.tab, route.id]);

  const settingsButton = (
    <button className={`icon-btn ${state.assistant?.online ? "badge" : ""}`} onClick={() => navigate({ tab: "settings" })} aria-label="Settings">
      <Icon name="settings" />
      {state.assistant?.online && <span className="dot" />}
    </button>
  );

  let title = "Today";
  let subtitle: string | undefined = formatDay(new Date());
  let onBack: (() => void) | undefined;
  let body: React.ReactNode = null;

  if (!ws) {
    body = (
      <div className="banner busy">
        <span className="spinner" /> Loading…
      </div>
    );
  } else {
    switch (route.tab) {
      case "today":
        body = <Today state={state} workspace={ws} navigate={navigate} />;
        break;
      case "capture":
        title = "Capture";
        subtitle = "One line per thing you must do";
        body = <Capture state={state} workspace={ws} navigate={navigate} />;
        break;
      case "plan":
        if (route.id) {
          title = "Plan";
          subtitle = route.id;
          onBack = () => back({ tab: "plan" });
          body = <PlanDetail state={state} workspace={ws} id={route.id} />;
        } else {
          title = "Plan";
          subtitle = "Execution parameters per todo";
          body = <PlanList state={state} workspace={ws} navigate={navigate} />;
        }
        break;
      case "review":
        title = "Review";
        subtitle = "Outcomes, achievements, reflection";
        body = <Review state={state} workspace={ws} navigate={navigate} />;
        break;
      case "notes":
        if (route.id) {
          title = "Note";
          subtitle = undefined;
          onBack = () => back({ tab: "notes" });
          body = <NoteDetail workspace={ws} id={route.id} />;
        } else {
          title = "Notes";
          subtitle = `${ws.compositions.length} composition${ws.compositions.length === 1 ? "" : "s"}`;
          body = <NotesList workspace={ws} navigate={navigate} />;
        }
        break;
      case "settings":
        title = "Settings";
        subtitle = state.assistant?.label;
        onBack = () => back({ tab: "today" });
        body = <Settings state={state} session={session} workspace={ws} />;
        break;
    }
  }

  return (
    <div className="app">
      <TabBar route={route} navigate={navigate} counts={{}} />
      <div className="main">
        <TopBar title={title} {...(subtitle ? { subtitle } : {})} {...(onBack ? { onBack } : {})} right={route.tab === "settings" ? undefined : settingsButton} />
        <main className="content stack">
          {state.busy && (
            <div className="banner busy">
              <span className="spinner" /> {state.busy}
            </div>
          )}
          {state.error && (
            <div className="banner error" onClick={state.clearError} role="alert">
              <Icon name="warn" size={18} /> <span className="grow">{state.error}</span>
            </div>
          )}
          {body}
        </main>
      </div>
    </div>
  );
}
