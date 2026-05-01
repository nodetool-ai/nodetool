"use client";

import { useState, useEffect } from "react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import Image from "next/image";

type NavigationItem = {
  name: string;
  href: string;
};

type HeaderProps = {
  navigation: NavigationItem[];
  rightSlot?: React.ReactNode;
};

const Header: React.FC<HeaderProps> = ({ navigation, rightSlot }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Lock body scroll when menu is open and handle focus trap
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      
      // Focus trap: keep focus within menu
      const menuPanel = document.querySelector('[role="dialog"]') as HTMLElement;
      if (menuPanel) {
        const focusableElements = menuPanel.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
        
        const handleTabKey = (e: KeyboardEvent) => {
          if (e.key !== 'Tab') return;
          
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              lastElement?.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastElement) {
              firstElement?.focus();
              e.preventDefault();
            }
          }
        };
        
        document.addEventListener('keydown', handleTabKey);
        return () => {
          document.removeEventListener('keydown', handleTabKey);
        };
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <header className="absolute inset-x-0 top-0 z-50 bg-transparent r-0">
      <nav
        className="flex items-center justify-between p-6 lg:px-8"
        aria-label="Global"
      >
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">nodetool</span>
            {/* <img
              className="col-span-2 max-h-12 w-full object-contain lg:col-span-1"
              src="/logo_small.png"
              width="64"
              height="64"
            /> */}
          </Link>
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-200"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open main menu</span>
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        <div className="hidden lg:flex lg:gap-x-12">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-xl font-light leading-6 text-gray-200 hover:text-white  transition-colors duration-200"
            >
              {item.name}
            </Link>
          ))}
        </div>
        <div className="hidden lg:flex lg:flex-1 lg:justify-end">
          {rightSlot}
        </div>
      </nav>
      
      {/* Simple mobile menu with CSS transitions */}
      <div className="lg:hidden">
        {/* Backdrop */}
        <div
          role="button"
          aria-label="Close menu"
          tabIndex={mobileMenuOpen ? 0 : -1}
          className={`fixed inset-0 z-50 bg-slate-950/90 transition-opacity duration-300 ${
            mobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setMobileMenuOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setMobileMenuOpen(false);
            }
          }}
        />
        
        {/* Menu Panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation menu"
          className={`fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-gradient-radial from-slate-850 to-gray-950 px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10 transition-transform duration-300 ${
            mobileMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <Link href="/" className="-m-1.5 p-1.5">
              <Image
                className="col-span-2 min-h-12 max-h-12 w-full object-contain lg:col-span-1"
                src="/logo_small.png"
                width={64}
                height={64}
                alt="nodetool"
              />
            </Link>
            <span className="text-primary text-2xl uppercase bg-gradient-to-t from-white via-white to-[#51797e] font-jetbrains text-transparent bg-clip-text">
              NodeTool
            </span>
            <button
              type="button"
              className="-m-1 rounded-md p-1 text-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="sr-only">Close menu</span>
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-gray-500/10">
              <div className="space-y-2 py-6">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="-mx-3 block px-3 py-2 text-xl leading-7 text-gray-100 hover:bg-gray-800 hover:text-white transition-colors duration-200 border-b border-gray-500"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
              <div className="py-6">{rightSlot}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
