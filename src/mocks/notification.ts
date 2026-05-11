export async function sendNotification(_options: { title: string; body: string }): Promise<void> {}
export async function isPermissionGranted(): Promise<boolean> { return false; }
export async function requestPermission(): Promise<string> { return 'denied'; }
