export function getDeviceId(): string {
  let id = localStorage.getItem("sg.device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("sg.device_id", id);
  }
  return id;
}
