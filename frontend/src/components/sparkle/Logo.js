export const LOGO_URL = "/logo.png";
export const LOGO_ORIGINAL_URL =
  "https://customer-assets-jt897jd0.emergentagent.net/job_c23d2843-1fde-450a-98b4-210f81670a64/artifacts/e182e7a799b30d20_image%20%281%29.png";

export const Logo = ({ className = "h-12", testid = "brand-logo" }) => (
  <img src={LOGO_URL} alt="Agência Sparkle" data-testid={testid} className={`${className} w-auto object-contain`} />
);

export const Star = ({ className = "w-3 h-3" }) => <span className={`sparkle-star inline-block bg-[#EB7300] ${className}`} />;
