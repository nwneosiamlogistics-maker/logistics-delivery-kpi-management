import React, { useState } from 'react';
import { User } from '../types';

const LOGIN_PASSWORD = '1234';
const STORAGE_KEY = 'logistics_kpi_user';

const PRESET_USERS: { id: string; name: string; role: User['role']; email: string }[] = [
  { id: 'admin-001', name: 'neosiam admin',   role: 'Admin',  email: 'admin@neosiam.com' },
  { id: 'staff-001', name: 'เจ้าหน้าที่ 1',  role: 'Staff',  email: 'staff1@neosiam.com' },
  { id: 'staff-002', name: 'เจ้าหน้าที่ 2',  role: 'Staff',  email: 'staff2@neosiam.com' },
  { id: 'viewer-001', name: 'ผู้ดูข้อมูล',   role: 'Viewer', email: 'viewer@neosiam.com' },
];

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [selectedUserId, setSelectedUserId] = useState(PRESET_USERS[0].id);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== LOGIN_PASSWORD) {
      setError('รหัสผ่านไม่ถูกต้อง');
      return;
    }

    const user = PRESET_USERS.find(u => u.id === selectedUserId);
    if (!user) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    onLogin(user);
  };

  const roleColors: Record<User['role'], string> = {
    Admin: 'text-purple-600 bg-purple-50',
    Staff:  'text-blue-600 bg-blue-50',
    Viewer: 'text-gray-600 bg-gray-50',
  };

  const selectedUser = PRESET_USERS.find(u => u.id === selectedUserId)!;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg mb-4">
            <i className="fas fa-truck text-white text-2xl"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">ระบบบริหาร KPI การจัดส่ง</h1>
          <p className="text-sm text-gray-500 mt-1">NeoSiam Logistics</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-6">เข้าสู่ระบบ</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* User selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-user mr-2 text-indigo-400"></i>เลือกผู้ใช้งาน
              </label>
              <div className="grid gap-2">
                {PRESET_USERS.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${
                      selectedUserId === u.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        selectedUserId === u.id ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {u.name.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-800 text-sm">{u.name}</span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${roleColors[u.role]}`}>
                      {u.role}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-lock mr-2 text-indigo-400"></i>รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="กรอกรหัสผ่าน"
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-gray-800 text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                  <i className="fas fa-circle-exclamation"></i> {error}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <i className="fas fa-right-to-bracket"></i>
              เข้าสู่ระบบเป็น {selectedUser.name}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2026 NeoSiam Logistics · KPI Management System
        </p>
      </div>
    </div>
  );
};

export default Login;
