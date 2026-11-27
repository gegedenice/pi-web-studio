// « Se déconnecter » (client-safe): ends pi-web's password session and, behind
// Traefik's basic authentication, makes the browser forget the account, so the
// next page asks for one again (to change accounts while testing, for instance).

export interface LogoutPlan {
  /** DELETE /api/web-auth: pi-web's session cookie. */
  clearWebSession: boolean;
  /**
   * A request with a made-up account, which Traefik refuses (401): Chrome, Edge and
   * Firefox then replace the account they kept for the site. Only behind the proxy:
   * reaching pi-web itself, the Basic header would count as a wrong password.
   */
  forgetBasicAuth: boolean;
  /** Where the browser goes next. */
  next: string;
}

export function logoutPlan(me: { fromProxy: boolean; webPassword: boolean }): LogoutPlan | null {
  if (!me.fromProxy && !me.webPassword) return null;
  return { clearWebSession: me.webPassword, forgetBasicAuth: me.fromProxy, next: me.fromProxy ? "/studio" : "/login" };
}

function forgetBasicAuth(): Promise<void> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `/api/studio/me?logout=${Date.now()}`, true, "deconnexion", `x${Math.random().toString(36).slice(2)}`);
    xhr.onloadend = () => resolve();
    xhr.send();
  });
}

export async function logout(plan: LogoutPlan): Promise<void> {
  if (plan.clearWebSession) await fetch("/api/web-auth", { method: "DELETE", cache: "no-store" }).catch(() => undefined);
  if (plan.forgetBasicAuth) await forgetBasicAuth();
  window.location.assign(plan.next);
}
