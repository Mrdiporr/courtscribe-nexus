// Stable device identifier + human label for the per-device consent system
const DEVICE_ID_KEY = 'mybarrister_device_id';
const DEVICE_LABEL_KEY = 'mybarrister_device_label';

function detectDeviceLabel(): string {
  const ua = navigator.userAgent;
  let platform = 'Device';
  if (/iPhone|iPad|iPod/.test(ua)) platform = 'iOS';
  else if (/Android/.test(ua)) platform = 'Android';
  else if (/Mac/.test(ua)) platform = 'macOS';
  else if (/Windows/.test(ua)) platform = 'Windows';
  else if (/Linux/.test(ua)) platform = 'Linux';

  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';

  return `${platform} • ${browser}`;
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceLabel(): string {
  let label = localStorage.getItem(DEVICE_LABEL_KEY);
  if (!label) {
    label = detectDeviceLabel();
    localStorage.setItem(DEVICE_LABEL_KEY, label);
  }
  return label;
}

export function setDeviceLabel(label: string) {
  localStorage.setItem(DEVICE_LABEL_KEY, label);
}
