import React from 'react';
import { User } from '../types';

interface NavbarProps {
  user: User;
}

export const Navbar: React.FC<NavbarProps> = ({ user }) => {
  const roleLabels: Record<string, string> = {
    Admin: 'neosiam admin',
    Staff: 'เจ้าหน้าที่',
    Viewer: 'ผู้ชม'
  };

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 fixed w-full z-30 top-0 transition-all">
      <div className="px-3 py-3 lg:px-5 lg:pl-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-start">
            <span className="self-center text-xl font-bold sm:text-2xl whitespace-nowrap bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              <i className="fas fa-truck-loading mr-2"></i>
              ระบบบริหาร KPI การจัดส่ง
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-gray-900">{user.name}</div>
              <div className="text-xs text-gray-500">{roleLabels[user.role] || user.role}</div>
            </div>
            <div className="flex items-center">
              <img className="w-8 h-8 rounded-full" src={`https://picsum.photos/seed/${user.name}/200`} alt="user photo" />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
