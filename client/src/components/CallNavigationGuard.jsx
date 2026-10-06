import { useCallback, useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { CALL_ACTIVE, useAgent } from '../context/AgentContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Router-level navigation lock for the agent call lifecycle (Part 5).
 *
 * While a call is live (dialing / connected / ending) the agent must not be
 * able to leave the workspace: in-app navigation is intercepted by React
 * Router's useBlocker and a full page unload (reload / tab close) raises the
 * browser's native confirmation. Nothing is auto-ended — the only way out is
 * the End Call action, so the server record is always closed out explicitly.
 *
 * Must be rendered inside AgentProvider (for call state) and inside the data
 * router (createBrowserRouter — useBlocker requires a data router).
 */
export default function CallNavigationGuard() {
  const { callStatus } = useAgent();
  const { push } = useToast();
  const active = CALL_ACTIVE.has(callStatus);

  // Block only real route changes — clicking the current tab stays silent.
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        active && currentLocation.pathname !== nextLocation.pathname,
      [active]
    )
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      push('End the active call before leaving the workspace.', 'warning');
      blocker.reset();
    }
  }, [blocker, push]);

  // Reload / tab-close during a call: the browser shows its own generic
  // prompt. If the agent proceeds, the mount-time restore effect in
  // AgentContext re-materializes the still-live call from the server.
  useEffect(() => {
    if (!active) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);

  return null;
}
