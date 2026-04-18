export function generateDigitalId(role: "tourist" | "department"): string {
  const prefix = role === "tourist" ? "SG-TOURIST" : "SG-DEPT";
  return `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
}
