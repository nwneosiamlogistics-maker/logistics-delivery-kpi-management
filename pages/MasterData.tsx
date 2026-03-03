import React, { useState } from 'react';
import { Holiday, HolidayType, StoreClosure, KpiConfig, DelayReason, ImportLog } from '../types';

interface MasterDataProps {
  holidays: Holiday[];
  storeClosures: StoreClosure[];
  kpiConfigs: KpiConfig[];
  delayReasons: DelayReason[];
  importLogs: ImportLog[];
  onUpdateHolidays: (holidays: Holiday[]) => void;
  onUpdateStoreClosures: (closures: StoreClosure[]) => void;
  onUpdateKpiConfigs: (configs: KpiConfig[]) => void;
  onAddKpiConfig: (config: Omit<KpiConfig, 'id'>) => void;
  onUpdateDelayReasons: (reasons: DelayReason[]) => void;
  userRole: string;
}

type TabType = 'holidays' | 'closures' | 'kpi' | 'reasons' | 'logs';

export const MasterData: React.FC<MasterDataProps> = ({
  holidays,
  storeClosures,
  kpiConfigs,
  delayReasons,
  importLogs,
  onUpdateHolidays,
  onUpdateStoreClosures,
  onUpdateKpiConfigs,
  onAddKpiConfig,
  onUpdateDelayReasons,
  userRole
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('holidays');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddKpiModal, setShowAddKpiModal] = useState(false);

  const isAdmin = userRole === 'Admin';

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'holidays', label: 'วันหยุด', icon: 'fa-calendar-day' },
    { id: 'closures', label: 'ร้านปิดทำการ', icon: 'fa-store-slash' },
    { id: 'kpi', label: 'ตั้งค่า KPI', icon: 'fa-bullseye' },
    { id: 'reasons', label: 'เหตุผลล่าช้า', icon: 'fa-list-check' },
    { id: 'logs', label: 'ประวัตินำเข้า', icon: 'fa-history' },
  ];

  const handleAddHoliday = (holiday: Omit<Holiday, 'id'>) => {
    const newHoliday: Holiday = {
      ...holiday,
      id: `h-${Date.now()}`
    };
    onUpdateHolidays([...holidays, newHoliday]);
    setShowAddModal(false);
  };

  const handleDeleteHoliday = (id: string) => {
    onUpdateHolidays(holidays.filter(h => h.id !== id));
  };

  const handleAddStoreClosure = (closure: Omit<StoreClosure, 'id'>) => {
    const newClosure: StoreClosure = {
      ...closure,
      id: `sc-${Date.now()}`
    };
    onUpdateStoreClosures([...storeClosures, newClosure]);
    setShowAddModal(false);
  };

  const handleDeleteStoreClosure = (id: string) => {
    onUpdateStoreClosures(storeClosures.filter(c => c.id !== id));
  };

  const handleUpdateKpiConfig = (config: KpiConfig) => {
    onUpdateKpiConfigs(kpiConfigs.map(c => c.id === config.id ? config : c));
    setEditingItem(null);
  };

  const handleAddDelayReason = (reason: DelayReason) => {
    onUpdateDelayReasons([...delayReasons, reason]);
    setShowAddModal(false);
  };

  const handleDeleteDelayReason = (code: string) => {
    onUpdateDelayReasons(delayReasons.filter(r => r.code !== code));
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
            ตั้งค่าข้อมูลหลัก
          </h2>
          <p className="text-gray-500 mt-1">จัดการวันหยุด, ร้านปิดทำการ, กฎ KPI, และเหตุผลความล่าช้า</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="flex border-b border-gray-100 bg-gray-50/50 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 font-medium text-sm transition-all whitespace-nowrap ${activeTab === tab.id
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
            >
              <i className={`fas ${tab.icon}`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'holidays' && (
            <HolidaysTab
              holidays={holidays}
              isAdmin={isAdmin}
              onAdd={() => setShowAddModal(true)}
              onDelete={handleDeleteHoliday}
            />
          )}

          {activeTab === 'closures' && (
            <StoreClosuresTab
              closures={storeClosures}
              isAdmin={isAdmin}
              onAdd={() => setShowAddModal(true)}
              onDelete={handleDeleteStoreClosure}
            />
          )}

          {activeTab === 'kpi' && (
            <KpiConfigTab
              configs={kpiConfigs}
              isAdmin={isAdmin}
              editingItem={editingItem}
              onEdit={setEditingItem}
              onAdd={() => setShowAddKpiModal(true)}
              onSave={handleUpdateKpiConfig}
              onCancel={() => setEditingItem(null)}
              onDelete={(id) => onUpdateKpiConfigs(kpiConfigs.filter(c => c.id !== id))}
            />
          )}

          {activeTab === 'reasons' && (
            <DelayReasonsTab
              reasons={delayReasons}
              isAdmin={isAdmin}
              onAdd={() => setShowAddModal(true)}
              onDelete={handleDeleteDelayReason}
            />
          )}

          {activeTab === 'logs' && (
            <ImportLogsTab logs={importLogs} />
          )}
        </div>
      </div>

      {showAddModal && activeTab === 'holidays' && (
        <AddHolidayModal
          onSave={handleAddHoliday}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showAddModal && activeTab === 'closures' && (
        <AddStoreClosureModal
          onSave={handleAddStoreClosure}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showAddModal && activeTab === 'reasons' && (
        <AddDelayReasonModal
          onSave={handleAddDelayReason}
          onClose={() => setShowAddModal(false)}
          existingCodes={delayReasons.map(r => r.code)}
        />
      )}

      {showAddKpiModal && (
        <AddKpiConfigModal
          onSave={(config) => {
            onAddKpiConfig(config);
            setShowAddKpiModal(false);
          }}
          onClose={() => setShowAddKpiModal(false)}
        />
      )}
    </div>
  );
};

const HolidaysTab: React.FC<{
  holidays: Holiday[];
  isAdmin: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
}> = ({ holidays, isAdmin, onAdd, onDelete }) => {
  const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const typeColors: Record<HolidayType, string> = {
    [HolidayType.PUBLIC]: 'bg-red-100 text-red-700',
    [HolidayType.COMPANY]: 'bg-blue-100 text-blue-700',
    [HolidayType.SUNDAY]: 'bg-gray-100 text-gray-700',
    [HolidayType.SPECIAL]: 'bg-purple-100 text-purple-700',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-gray-800">วันหยุดนักขัตฤกษ์และวันหยุดบริษัท</h3>
        {isAdmin && (
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <i className="fas fa-plus mr-2"></i>เพิ่มวันหยุด
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-bold text-gray-700">วันที่</th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">ชื่อวันหยุด</th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">ประเภท</th>
              {isAdmin && <th className="px-4 py-3 text-center font-bold text-gray-700">ดำเนินการ</th>}
            </tr>
          </thead>
          <tbody>
            {sortedHolidays.map(holiday => (
              <tr key={holiday.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono">{holiday.date}</td>
                <td className="px-4 py-3 font-medium">{holiday.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-lg text-xs font-bold ${typeColors[holiday.type]}`}>
                    {holiday.type}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onDelete(holiday.id)}
                      className="text-red-500 hover:text-red-700"
                      title="ลบวันหยุด"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StoreClosuresTab: React.FC<{
  closures: StoreClosure[];
  isAdmin: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
}> = ({ closures, isAdmin, onAdd, onDelete }) => {
  const ruleLabels: Record<string, string> = {
    'every_sunday': 'ทุกวันอาทิตย์',
    'every_saturday': 'ทุกวันเสาร์',
    'every_weekend': 'ทุกสุดสัปดาห์',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-gray-800">กฎการปิดร้านค้า</h3>
        {isAdmin && (
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <i className="fas fa-plus mr-2"></i>เพิ่มการปิดร้าน
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-bold text-gray-700">รหัสร้านค้า</th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">วันที่ / กฎ</th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">เหตุผล</th>
              {isAdmin && <th className="px-4 py-3 text-center font-bold text-gray-700">ดำเนินการ</th>}
            </tr>
          </thead>
          <tbody>
            {closures.map(closure => (
              <tr key={closure.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-bold">{closure.storeId}</td>
                <td className="px-4 py-3">
                  {closure.date ? (
                    <span className="font-mono">{closure.date}</span>
                  ) : (
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">
                      {closure.closeRule ? ruleLabels[closure.closeRule] || closure.closeRule : ''}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{closure.reason}</td>
                {isAdmin && (
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onDelete(closure.id)}
                      className="text-red-500 hover:text-red-700"
                      title="ลบการปิดร้าน"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const KpiConfigTab: React.FC<{
  configs: KpiConfig[];
  isAdmin: boolean;
  editingItem: KpiConfig | null;
  onEdit: (config: KpiConfig) => void;
  onAdd: () => void;
  onSave: (config: KpiConfig) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}> = ({ configs, isAdmin, editingItem, onEdit, onAdd, onSave, onCancel, onDelete }) => {
  const [editValues, setEditValues] = useState<KpiConfig | null>(null);

  React.useEffect(() => {
    setEditValues(editingItem);
  }, [editingItem]);

  const draftCount = configs.filter(c => c.isDraft).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-gray-800">เกณฑ์ KPI ตามจังหวัด/อำเภอ</h3>
          {draftCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-xs font-bold animate-pulse">
              {draftCount} ร่างรอกำหนด
            </span>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <i className="fas fa-plus mr-2"></i>เพิ่มเกณฑ์พื้นที่
          </button>
        )}
      </div>

      {draftCount > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <i className="fas fa-exclamation-triangle text-amber-500 mt-0.5"></i>
          <div>
            <p className="text-sm font-bold text-amber-800">พบ {draftCount} จังหวัด/อำเภอใหม่จากข้อมูลที่นำเข้า</p>
            <p className="text-xs text-amber-600 mt-0.5">กดปุ่มแก้ไข <i className="fas fa-edit"></i> เพื่อกำหนดระยะเวลาส่งตรงเวลาและบันทึกเกณฑ์</p>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-bold text-gray-700">สาขา</th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">จังหวัด</th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">อำเภอ</th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">ส่งตรงเวลา (วัน)</th>
              {isAdmin && <th className="px-4 py-3 text-center font-bold text-gray-700">ดำเนินการ</th>}
            </tr>
          </thead>
          <tbody>
            {configs.map(config => (
              <tr key={config.id} className={`border-b border-gray-50 hover:bg-gray-50 ${config.isDraft ? 'bg-amber-50/60' : ''}`}>
                <td className="px-4 py-3 text-gray-600">
                  {editValues?.id === config.id ? (
                    <input
                      type="text"
                      value={editValues.branch || ''}
                      onChange={e => setEditValues({ ...editValues, branch: e.target.value })}
                      className="w-32 px-2 py-1 border rounded"
                      placeholder="สาขา"
                      aria-label="สาขา"
                    />
                  ) : (
                    config.branch ? (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-semibold">{config.branch}</span>
                    ) : '-'
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {editValues?.id === config.id ? (
                    <input
                      type="text"
                      value={editValues.province || ''}
                      onChange={e => setEditValues({ ...editValues, province: e.target.value })}
                      className="w-32 px-2 py-1 border rounded"
                      placeholder="จังหวัด"
                      aria-label="จังหวัด"
                    />
                  ) : (
                    config.province || '-'
                  )}
                </td>
                <td className="px-4 py-3 font-bold">
                  {editValues?.id === config.id ? (
                    <input
                      type="text"
                      value={editValues.district}
                      onChange={e => setEditValues({ ...editValues, district: e.target.value })}
                      className="w-32 px-2 py-1 border rounded"
                      placeholder="อำเภอ"
                      aria-label="อำเภอ"
                    />
                  ) : (
                    <span className="flex items-center gap-2">
                      {config.district}
                      {config.isDraft && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-600 border border-amber-200 rounded text-xs font-bold">ร่าง</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editValues?.id === config.id ? (
                    <input
                      type="number"
                      value={editValues.onTimeLimit}
                      onChange={e => setEditValues({ ...editValues, onTimeLimit: parseInt(e.target.value) || 0 })}
                      className="w-20 px-2 py-1 border rounded"
                      aria-label="ระยะเวลาส่งมอบตรงเวลา"
                      placeholder="0"
                    />
                  ) : (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-bold">{config.onTimeLimit}</span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-center">
                    {editValues?.id === config.id ? (
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => editValues && onSave({ ...editValues, isDraft: false })}
                          className="text-green-600 hover:text-green-800"
                          title="บันทึก"
                        >
                          <i className="fas fa-check"></i>
                        </button>
                        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700" title="ยกเลิก">
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-center gap-3">
                        <button
                          onClick={() => onEdit(config)}
                          className={`${config.isDraft ? 'text-amber-500 hover:text-amber-700' : 'text-indigo-500 hover:text-indigo-700'}`}
                          title={config.isDraft ? 'กำหนดเกณฑ์ KPI' : 'แก้ไข'}
                        >
                          <i className={`fas ${config.isDraft ? 'fa-pen-to-square' : 'fa-edit'}`}></i>
                        </button>
                        <button
                          onClick={() => window.confirm('ยืนยันสมบรูณ์การลบเกณฑ์นี้?') && onDelete && onDelete(config.id)}
                          className="text-red-400 hover:text-red-600"
                          title="ลบเกณฑ์"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DelayReasonsTab: React.FC<{
  reasons: DelayReason[];
  isAdmin: boolean;
  onAdd: () => void;
  onDelete: (code: string) => void;
}> = ({ reasons, isAdmin, onAdd, onDelete }) => {
  const categoryLabels: Record<string, string> = {
    'internal': 'ภายใน',
    'external': 'ภายนอก',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-gray-800">รหัสเหตุผลความล่าช้า</h3>
        {isAdmin && (
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <i className="fas fa-plus mr-2"></i>เพิ่มเหตุผล
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reasons.map(reason => (
          <div key={reason.code} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded font-mono text-sm font-bold">
                {reason.code}
              </span>
              <span className="font-medium">{reason.label}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${reason.category === 'internal' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'
                }`}>
                {categoryLabels[reason.category]}
              </span>
            </div>
            {isAdmin && (
              <button
                onClick={() => onDelete(reason.code)}
                className="text-red-500 hover:text-red-700"
                title="ลบเหตุผล"
              >
                <i className="fas fa-trash"></i>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const ImportLogsTab: React.FC<{ logs: ImportLog[] }> = ({ logs }) => {
  const sortedLogs = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <div>
      <h3 className="font-bold text-gray-800 mb-4">ประวัติการนำเข้าข้อมูล</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-bold text-gray-700">เวลา</th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">ไฟล์</th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">ผู้ดำเนินการ</th>
              <th className="px-4 py-3 text-center font-bold text-gray-700">สร้างใหม่</th>
              <th className="px-4 py-3 text-center font-bold text-gray-700">อัปเดต</th>
              <th className="px-4 py-3 text-center font-bold text-gray-700">ข้าม</th>
              <th className="px-4 py-3 text-center font-bold text-gray-700">ข้อผิดพลาด</th>
            </tr>
          </thead>
          <tbody>
            {sortedLogs.map(log => (
              <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">
                  {new Date(log.timestamp).toLocaleString('th-TH')}
                </td>
                <td className="px-4 py-3 font-medium">{log.fileName}</td>
                <td className="px-4 py-3 text-gray-600">{log.userName}</td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-bold">{log.created}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded font-bold">{log.updated}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded font-bold">{log.skipped}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded font-bold ${log.errors > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                    }`}>{log.errors}</span>
                </td>
              </tr>
            ))}
            {sortedLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  ยังไม่มีประวัตินำเข้าข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AddHolidayModal: React.FC<{
  onSave: (holiday: Omit<Holiday, 'id'>) => void;
  onClose: () => void;
}> = ({ onSave, onClose }) => {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<HolidayType>(HolidayType.PUBLIC);

  const handleSubmit = () => {
    if (date && name) {
      onSave({ date, name, type });
    }
  };

  return (
    <Modal title="เพิ่มวันหยุด" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="holidayDate" className="block text-sm font-bold text-gray-700 mb-1">วันที่</label>
          <input
            id="holidayDate"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">ชื่อวันหยุด</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="เช่น สงกรานต์"
          />
        </div>
        <div>
          <label htmlFor="holidayType" className="block text-sm font-bold text-gray-700 mb-1">ประเภท</label>
          <select
            id="holidayType"
            value={type}
            onChange={e => setType(e.target.value as HolidayType)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            title="ประเภทวันหยุด"
          >
            <option value={HolidayType.PUBLIC}>วันหยุดนักขัตฤกษ์</option>
            <option value={HolidayType.COMPANY}>วันหยุดบริษัท</option>
            <option value={HolidayType.SPECIAL}>วันพิเศษ</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
          ยกเลิก
        </button>
        <button
          onClick={handleSubmit}
          disabled={!date || !name}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-50"
        >
          เพิ่มวันหยุด
        </button>
      </div>
    </Modal>
  );
};

const AddStoreClosureModal: React.FC<{
  onSave: (closure: Omit<StoreClosure, 'id'>) => void;
  onClose: () => void;
}> = ({ onSave, onClose }) => {
  const [storeId, setStoreId] = useState('');
  const [closureType, setClosureType] = useState<'date' | 'rule'>('date');
  const [date, setDate] = useState('');
  const [closeRule, setCloseRule] = useState<'every_sunday' | 'every_saturday' | 'every_weekend'>('every_sunday');
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (storeId && reason) {
      if (closureType === 'date' && date) {
        onSave({ storeId, date, reason });
      } else if (closureType === 'rule') {
        onSave({ storeId, closeRule, reason });
      }
    }
  };

  return (
    <Modal title="เพิ่มการปิดร้านค้า" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">รหัสร้านค้า</label>
          <input
            type="text"
            value={storeId}
            onChange={e => setStoreId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="เช่น STR-A1"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">ประเภทการปิด</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={closureType === 'date'}
                onChange={() => setClosureType('date')}
              />
              <span>วันที่เฉพาะเจาะจง</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={closureType === 'rule'}
                onChange={() => setClosureType('rule')}
              />
              <span>กฎปิดประจำ</span>
            </label>
          </div>
        </div>
        {closureType === 'date' ? (
          <div>
            <label htmlFor="closureDate" className="block text-sm font-bold text-gray-700 mb-1">วันที่</label>
            <input
              id="closureDate"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              title="เลือกวันที่ปิดร้าน"
              placeholder="วว/ดด/ปปปป"
            />
          </div>
        ) : (
          <div>
            <label htmlFor="closureRule" className="block text-sm font-bold text-gray-700 mb-1">กฎ</label>
            <select
              id="closureRule"
              value={closeRule}
              onChange={e => setCloseRule(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              title="กฎการปิด"
            >
              <option value="every_sunday">ทุกวันอาทิตย์</option>
              <option value="every_saturday">ทุกวันเสาร์</option>
              <option value="every_weekend">ทุกสุดสัปดาห์</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor="closureReason" className="block text-sm font-bold text-gray-700 mb-1">เหตุผล</label>
          <input
            id="closureReason"
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="เช่น ปรับปรุงร้าน"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
          ยกเลิก
        </button>
        <button
          onClick={handleSubmit}
          disabled={!storeId || !reason || (closureType === 'date' && !date)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-50"
        >
          เพิ่มการปิดร้าน
        </button>
      </div>
    </Modal>
  );
};

const AddDelayReasonModal: React.FC<{
  onSave: (reason: DelayReason) => void;
  onClose: () => void;
  existingCodes: string[];
}> = ({ onSave, onClose, existingCodes }) => {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<'internal' | 'external'>('external');

  const handleSubmit = () => {
    if (code && label && !existingCodes.includes(code)) {
      onSave({ code, label, category });
    }
  };

  return (
    <Modal title="เพิ่มเหตุผลความล่าช้า" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">รหัส</label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="เช่น R11"
          />
          {existingCodes.includes(code) && (
            <p className="text-red-500 text-xs mt-1">รหัสนี้มีอยู่แล้ว</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">ชื่อเหตุผล</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="เช่น อุปกรณ์ชำรุด"
          />
        </div>
        <div>
          <label htmlFor="reasonCategory" className="block text-sm font-bold text-gray-700 mb-1">หมวดหมู่</label>
          <select
            id="reasonCategory"
            value={category}
            onChange={e => setCategory(e.target.value as 'internal' | 'external')}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            title="หมวดหมู่เหตุผล"
          >
            <option value="internal">ภายใน</option>
            <option value="external">ภายนอก</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
          ยกเลิก
        </button>
        <button
          onClick={handleSubmit}
          disabled={!code || !label || existingCodes.includes(code)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-50"
        >
          เพิ่มเหตุผล
        </button>
      </div>
    </Modal>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  onClose,
  children
}) => (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
    <div className="glass-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex justify-between items-center p-6 border-b border-gray-100">
        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="ปิดหน้าต่าง">
          <i className="fas fa-times"></i>
        </button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const AddKpiConfigModal: React.FC<{
  onSave: (config: Omit<KpiConfig, 'id'>) => void;
  onClose: () => void;
}> = ({ onSave, onClose }) => {
  const [branch, setBranch] = useState('');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [onTimeLimit, setOnTimeLimit] = useState(1);

  const handleSubmit = () => {
    if (district) {
      onSave({ branch: branch || undefined, province: province || undefined, district, onTimeLimit });
    }
  };

  return (
    <Modal title="เพิ่มเกณฑ์ KPI ใหม่" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="kpiBranch" className="block text-sm font-bold text-gray-700 mb-1">สาขา</label>
          <input
            id="kpiBranch"
            type="text"
            value={branch}
            onChange={e => setBranch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="ชื่อสาขา เช่น สาขานครสวรรค์"
          />
        </div>
        <div>
          <label htmlFor="kpiProvince" className="block text-sm font-bold text-gray-700 mb-1">จังหวัด</label>
          <input
            id="kpiProvince"
            type="text"
            value={province}
            onChange={e => setProvince(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="ชื่อจังหวัด"
          />
        </div>
        <div>
          <label htmlFor="kpiDistrict" className="block text-sm font-bold text-gray-700 mb-1">อำเภอ</label>
          <input
            id="kpiDistrict"
            type="text"
            value={district}
            onChange={e => setDistrict(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="ชื่ออำเภอ"
          />
        </div>
        <div>
          <label htmlFor="kpiOnTime" className="block text-sm font-bold text-gray-700 mb-1">ระยะเวลาส่งมอบตรงเวลา (วัน)</label>
          <input
            id="kpiOnTime"
            type="number"
            min={1}
            value={onTimeLimit}
            onChange={e => setOnTimeLimit(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
          ยกเลิก
        </button>
        <button
          onClick={handleSubmit}
          disabled={!district}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-50 hover:bg-indigo-700 shadow-md shadow-indigo-200"
        >
          บันทึกเกณฑ์
        </button>
      </div>
    </Modal>
  );
};
