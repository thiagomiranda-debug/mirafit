const NOTIF_KEY_PREFIX = "mirafit_notif_shown_";

function todayKey(userId: string) {
  return `${NOTIF_KEY_PREFIX}${userId}_${new Date().toDateString()}`;
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showTrainingReminder(routineName: string, userId: string) {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  if (alreadyShownToday(userId)) return;

  new Notification("Hora de treinar! 💪", {
    body: `Não esqueça do seu treino de hoje: ${routineName}`,
    icon: "/icons/icon-192.png",
  });

  markShownToday(userId);
}

export function alreadyShownToday(userId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  return !!localStorage.getItem(todayKey(userId));
}

export function markShownToday(userId: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(todayKey(userId), "1");
}

export function dismissReminderBanner(userId: string) {
  markShownToday(userId);
}
