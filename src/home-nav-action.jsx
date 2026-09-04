import './home-nav-action.css'

export function HomeNavAction({ tab, section = '', label }) {
  function navigate() {
    if (!tab) return
    window.SHubNavigation?.navigate({ tab, section })
  }

  return (
    <button
      type="button"
      className="home-nav-action"
      aria-label={label}
      onClick={navigate}
    />
  )
}
