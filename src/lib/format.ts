export function formatLKR(amount: number): string {
  return `Rs. ${new Intl.NumberFormat("en-LK").format(amount)}`;
}