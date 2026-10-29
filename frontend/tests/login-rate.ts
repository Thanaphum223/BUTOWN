const attempts: number[] = [];
export async function waitForLoginSlot() {
  const now = Date.now();
  while (attempts.length && now - attempts[0] > 61000) attempts.shift();
  if (attempts.length >= 19) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 61050 - (now - attempts[0]))),
    );
    attempts.splice(0, attempts.length);
  }
  attempts.push(Date.now());
}
