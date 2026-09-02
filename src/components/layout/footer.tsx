export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-white font-bold text-lg mb-3">Fortune Market</h3>
            <p className="text-sm text-gray-400">
              Fortune Market connects Sri Lankan home-based producers and small
              businesses with buyers.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Quick Links</h4>
            <div className="flex flex-col gap-2 text-sm">
              <a href="#" className="hover:text-white transition-colors">Terms &amp; Conditions</a>
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Contact Us</a>
            </div>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Categories</h4>
            <div className="flex flex-col gap-2 text-sm">
              <a href="/category/foods" className="hover:text-white transition-colors">Fortune Foods</a>
              <a href="/category/crafts" className="hover:text-white transition-colors">Fortune Crafts</a>
              <a href="/category/naturals" className="hover:text-white transition-colors">Fortune Naturals</a>
              <a href="/category/fashion" className="hover:text-white transition-colors">Fortune Fashion</a>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-500">
          © 2024 Fortune Market. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
