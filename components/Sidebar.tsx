
import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line' },
    { id: 'import', label: 'Data Import', icon: 'fa-file-import' },
    { id: 'exceptions', label: 'KPI Exceptions', icon: 'fa-exclamation-triangle' },
    { id: 'analysis', label: 'Weekday Analysis', icon: 'fa-calendar-alt' },
    { id: 'settings', label: 'Master Data', icon: 'fa-cogs' },
  ];

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
          </div>
        </div>
      </div>
    </aside>
  );
};
