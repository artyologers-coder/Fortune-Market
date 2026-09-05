interface LogoProps {
  className?: string;
}

export function Logo({ className = "h-10 w-auto" }: LogoProps) {
  return (
    <img
      src="/fortune-market-logo.svg"
      alt="Fortune Market"
      className={className}
    />
  );
}