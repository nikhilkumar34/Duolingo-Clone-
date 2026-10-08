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
    </div></div>
    <span aria-hidden="true">🎧</span>
  </div>;
}
