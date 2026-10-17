const endpoint = process.env.EMAIL_WORKER_URL ?? "http://app:3000/api/credential-emails/process";
const workerKey = process.env.EMAIL_WORKER_KEY?.trim();
const interval = Number(process.env.EMAIL_WORKER_INTERVAL_MS ?? 2000);

if (!workerKey) {
  throw new Error("Falta EMAIL_WORKER_KEY");
}

if (!Number.isFinite(interval) || interval < 1000) {
  throw new Error("EMAIL_WORKER_INTERVAL_MS debe ser un número mayor o igual a 1000");
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

console.log(`Trabajador de correo activo; intervalo ${interval} ms.`);

while (true) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "x-email-worker-key": workerKey },
    });
    const result = await response.json();
    if (!response.ok) {
      console.error("No se pudo procesar la entrega:", response.status, result.error ?? result);
    } else if (result.processed) {
      console.log("Entrega procesada:", result.status);
    }
  } catch (error) {
    console.error("Error temporal del trabajador:", error instanceof Error ? error.message : error);
  }
  await wait(interval);
}
