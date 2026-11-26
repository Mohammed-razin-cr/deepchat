self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = { title: "DeepChat", body: "New message", url: "/" };
  try {
    data = event.data.json();
  } catch {
    data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "DeepChat", {
      body: data.body || "",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
