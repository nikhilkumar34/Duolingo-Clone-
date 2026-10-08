"use client";

export function HeadphoneBird() {
  return <div className="ceremony-mascot" role="img" aria-label="Duo dancing with headphones">
    <div className="owl owl-large" aria-hidden="true"><div className="owl-motion">
      <div className="owl-ears" />
      <div className="owl-body"><span className="owl-wing left" /><span className="owl-wing right" />
        <div className="owl-eyes"><span className="owl-eye"><i /></span><span className="owl-eye"><i /></span></div>
        <span className="owl-beak" /><span className="owl-mouth happy" />
      </div>
      <span className="owl-foot left" /><span className="owl-foot right" />
      <svg className="owl-headphones" viewBox="0 0 148 100" aria-hidden="true">
        <path d="M20 64V54C20 21 42 7 74 7s54 14 54 47v10" fill="none" stroke="#8b8e9d" strokeWidth="9" />
        <path d="M20 54C20 23 42 7 74 7s54 16 54 47" fill="none" stroke="#e7e9f0" strokeWidth="5" />
        <rect x="9" y="53" width="22" height="40" rx="9" fill="#8b8e9d" />
        <rect x="9" y="53" width="13" height="40" rx="6" fill="#e7e9f0" />
        <rect x="117" y="53" width="22" height="40" rx="9" fill="#8b8e9d" />
        <rect x="126" y="53" width="13" height="40" rx="6" fill="#e7e9f0" />
      </svg>
    </div></div>
  </div>;
}
