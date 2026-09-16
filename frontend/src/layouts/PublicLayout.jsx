import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

function PublicLayout() {
  return (
    <>
      <Navbar />
      <main className="site-main">
        <Outlet />
      </main>
      <Footer />
    </>
  )
}

export default PublicLayout
