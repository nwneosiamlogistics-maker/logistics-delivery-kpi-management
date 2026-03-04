import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userRole?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, userRole = 'Viewer' }) => {
  const allMenuItems = [
    { id: 'dashboard', label: 'แดชบอร์ด', icon: 'fa-chart-line', roles: ['Admin', 'Staff', 'Viewer'] },
    { id: 'import', label: 'นำเข้าข้อมูล', icon: 'fa-file-import', roles: ['Admin', 'Staff'] },
    { id: 'upload-history', label: 'ประวัติไฟล์', icon: 'fa-history', roles: ['Admin', 'Staff'] },
    { id: 'weekly-report', label: 'รายงานประจำสัปดาห์', icon: 'fa-calendar-check', roles: ['Admin', 'Staff', 'Viewer'] },
    { id: 'delivery-status', label: 'ติดตามสถานะสินค้า', icon: 'fa-truck-moving', roles: ['Admin', 'Staff', 'Viewer'] },
    { id: 'exceptions', label: 'KPI ที่ไม่ผ่าน', icon: 'fa-exclamation-triangle', roles: ['Admin', 'Staff'] },
    { id: 'kpi-dashboard', label: 'KPI Dashboard', icon: 'fa-chart-bar', roles: ['Admin', 'Staff', 'Viewer'] },
    { id: 'analysis', label: 'วิเคราะห์รายวัน', icon: 'fa-calendar-alt', roles: ['Admin', 'Staff', 'Viewer'] },
    { id: 'settings', label: 'ตั้งค่าระบบ', icon: 'fa-cogs', roles: ['Admin'] },
  ];

  const menuItems = allMenuItems.filter(item => item.roles.includes(userRole));

  const roleLabels: Record<string, string> = {
    Admin: 'neosiam admin',
    Staff: 'เจ้าหน้าที่',
    Viewer: 'ผู้ชม'
  };

  return (
    <aside className="fixed top-0 left-0 z-20 flex flex-col flex-shrink-0 w-64 h-full pt-16 font-normal duration-75 lg:flex transition-width">
      <div className="relative flex flex-col flex-1 min-h-0 pt-0 bg-white border-r border-gray-200">
        <div className="flex flex-col flex-1 pt-5 pb-4 overflow-y-auto">
          <div className="flex-1 px-3 space-y-1 bg-white divide-y divide-gray-200">
            <ul className="pb-2 space-y-2">
              {menuItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center w-full p-2 text-base rounded-lg transition-colors group ${activeTab === item.id
                        ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                  >
                    <i className={`fas ${item.icon} w-6 h-6 flex items-center justify-center transition duration-75`}></i>
                    <span className="ml-3 font-medium">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="pt-4">
              <div className="px-3 py-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">สิทธิ์ของคุณ</p>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  userRole === 'Admin' ? 'bg-purple-100 text-purple-700' :
                  userRole === 'Staff' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  <i className={`fas ${
                    userRole === 'Admin' ? 'fa-shield-alt' :
                    userRole === 'Staff' ? 'fa-user-edit' :
                    'fa-eye'
                  }`}></i>
                  {roleLabels[userRole] || userRole}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-3 py-4 border-t border-gray-100">
          <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
            <div className="flex items-center gap-2 text-indigo-600 mb-2">
              <i className="fas fa-info-circle"></i>
              <span className="text-xs font-bold uppercase">สถานะระบบ</span>
            </div>
            <p className="text-xs text-gray-600">
              พร้อมติดตาม KPI แบบ Real-time
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};
