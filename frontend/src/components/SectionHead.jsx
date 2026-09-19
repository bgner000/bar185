// A plain section heading -- a small label, a title, an optional line of
// description. Kept intentionally simple rather than a component every
// section is forced through: pages with something more specific to say
// (the hero, the footer, the editorial story sections) write their own
// markup instead of reaching for this.
function SectionHead({ label, title, children }) {
  return (
    <div className="section-head">
      {label && <span className="meta">{label}</span>}
      <h2>{title}</h2>
      {children && <p className="lede">{children}</p>}
    </div>
  )
}

export default SectionHead
