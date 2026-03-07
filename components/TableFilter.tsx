import React from 'react';

interface TableFilterProps {
  branches: string[];
  provinces: string[];
  districts: string[];
  selectedBranch: string;
  selectedProvince: string;
  selectedDistrict: string;
  searchTerm: string;
  onBranchChange: (branch: string) => void;
  onProvinceChange: (province: string) => void;
  onDistrictChange: (district: string) => void;
  onSearchChange: (search: string) => void;
  searchPlaceholder?: string;
}

export const TableFilter: React.FC<TableFilterProps> = ({
  branches,
  provinces,
  districts,
  selectedBranch,
  selectedProvince,
  selectedDistrict,
  searchTerm,
  onBranchChange,
  onProvinceChange,
  onDistrictChange,
  onSearchChange,
  searchPlaceholder = 'ค้นหาด้วยเลขที่ใบสั่ง, อำเภอ, หรือร้านค้า...'
}) => {
  const hasFilters = selectedBranch || selectedProvince || selectedDistrict || searchTerm;

  return (
    <div className="mb-4 space-y-3">
      {/* Dropdowns Row */}
      <div className="flex flex-wrap gap-3">
        <select
          value={selectedBranch}
          onChange={e => onBranchChange(e.target.value)}
          title="เลือกสาขา"
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[140px]"
        >
          <option value="">ทุกสาขา</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        
        <select
          value={selectedProvince}
          onChange={e => { onProvinceChange(e.target.value); onDistrictChange(''); }}
          title="เลือกจังหวัด"
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[160px]"
        >
          <option value="">ทุกจังหวัด</option>
          {provinces.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        
        <select
          value={selectedDistrict}
          onChange={e => onDistrictChange(e.target.value)}
          title="เลือกอำเภอ"
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[160px]"
        >
          <option value="">ทุกอำเภอ</option>
          {districts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        
        {hasFilters && (
          <button
            onClick={() => { onBranchChange(''); onProvinceChange(''); onDistrictChange(''); onSearchChange(''); }}
            className="px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 flex items-center gap-1"
          >
            <i className="fas fa-times"></i>ล้างตัวกรอง
          </button>
        )}
      </div>
      
      {/* Search Row */}
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
        />
        {searchTerm && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="ล้างการค้นหา"
            aria-label="ล้างการค้นหา"
          >
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>
    </div>
  );
};
