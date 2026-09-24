import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Database,
  Sparkles,
  FileSpreadsheet,
  CalendarClock,
  BookOpen,
  Settings,
  LogOut,
  GraduationCap,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ListFilter,
  PlusCircle,
  Zap,
} from 'lucide-react';
import type{ DashboardNavTab } from '../../types';

interface SidebarProps {
  activeTab: DashboardNavTab;
  onTabChange: (tab: DashboardNavTab) => void;
  onLogout: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  onOpenAIGenerator: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface SubMenuItem {
  id: DashboardNavTab;
  label: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
  tooltipDesc?: string;
}

interface MenuGroup {
  id: string;
  title: string;
  icon: React.ElementType;
  subItems: SubMenuItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  isMobileOpen = false,
  onMobileClose,
  onOpenAIGenerator,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  // State to track accordion open/close for groups
  const [openGroups, setOpenGroups] = useState<{ [key: string]: boolean }>({
    questionBank: true,
    examTesting: true,
  });

  // Automatically keep parent group open if active tab belongs to it
useEffect(() => {
  if (['question-bank', 'new-question', 'ai-generator'].includes(activeTab)) {
    const timer = setTimeout(() => {
      setOpenGroups((prev) => ({ ...prev, questionBank: true }));
    }, 0);
    return () => clearTimeout(timer);
  }
}, [activeTab]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleItemClick = (id: DashboardNavTab) => {
    onTabChange(id);
    if (onMobileClose) {
      onMobileClose();
    }
  };

  // 1. Group "Ngân hàng Câu hỏi": 2 mục con: "Danh sách câu hỏi" & "Câu hỏi mới"
  const questionBankGroup: MenuGroup = {
    id: 'questionBank',
    title: 'Ngân hàng Câu hỏi',
    icon: Database,
    subItems: [
      {
        id: 'question-bank',
        label: 'Danh sách câu hỏi',
        icon: ListFilter,
        tooltipDesc: 'Xem ngân hàng câu hỏi dạng thu gọn, lọc theo môn/chương/CLO/Bloom',
      },
      {
        id: 'new-question',
        label: 'Câu hỏi mới',
        icon: PlusCircle,
        badge: 'Mới',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        tooltipDesc: 'Điều hướng trực tiếp đến màn hình chọn phương thức tạo câu hỏi',
      },
    ],
  };

  // 2. Group "Khảo thí & Đề thi": 3 mục con: "Tạo đề nhanh", "Quản lý đề thi", "Ca thi trực tuyến"
  const examTestingGroup: MenuGroup = {
    id: 'examTesting',
    title: 'Khảo thí & Đề thi',
    icon: FileSpreadsheet,
    subItems: [
      {
        id: 'quick-exam',
        label: 'Tạo đề nhanh',
        icon: Zap,
        badge: '⚡',
        tooltipDesc: 'Tính năng tạo nhanh đề thi ngẫu nhiên bám sát ma trận hoặc số lượng câu',
      },
      {
        id: 'exams',
        label: 'Quản lý đề thi',
        icon: FileSpreadsheet,
        tooltipDesc: 'Danh sách đề thi, xuất file Word/PDF',
      },
      {
        id: 'exam-sessions',
        label: 'Ca thi trực tuyến',
        icon: CalendarClock,
        tooltipDesc: 'Tạo link ca thi cho thí sinh nhập Họ tên + MSSV',
      },
    ],
  };

  const isQuestionBankActive =
    activeTab === 'question-bank' || activeTab === 'new-question' || activeTab === 'ai-generator';
  const isExamTestingActive =
    activeTab === 'quick-exam' || activeTab === 'exams' || activeTab === 'exam-sessions';

  const renderContent = (collapsed: boolean) => (
    <div className="relative flex flex-col h-full bg-white border-r border-slate-200 select-none transition-all duration-200">
      {/* Desktop Collapse/Expand Toggle Button on the border */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:flex absolute -right-3 top-5 w-6 h-6 rounded-full bg-white border border-slate-300 shadow-xs items-center justify-center text-slate-500 hover:text-slate-900 hover:border-slate-400 z-40 transition-colors cursor-pointer"
          title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {/* Top Logo & App Title */}
      <div
        className={`h-14 border-b border-slate-100 flex items-center ${
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-7 h-7 rounded-lg text-white flex items-center justify-center flex-shrink-0 shadow-xs cursor-pointer"
            style={{ backgroundColor: 'var(--primary)' }}
            onClick={() => handleItemClick('overview')}
            title="ExamFlow AI"
          >
            <GraduationCap className="w-4 h-4" />
          </div>
          {!collapsed && (
            <div
              className="flex items-baseline gap-1 min-w-0 truncate cursor-pointer"
              onClick={() => handleItemClick('overview')}
            >
              <span className="font-bold text-[17px] text-slate-900 tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
                ExamFlow
              </span>
              <span
                className="text-[9px] font-bold px-1 py-0.2 rounded text-white tracking-wider uppercase"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                AI
              </span>
            </div>
          )}
        </div>

        {/* Mobile close button */}
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Đóng menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Menu List */}
      <div className={`flex-1 py-3 space-y-1.5 overflow-y-auto custom-scrollbar ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && (
          <div className="px-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Menu Chính
          </div>
        )}

        {/* 1. Tổng quan */}
        {collapsed ? (
          <div className="relative group flex justify-center">
            <button
              type="button"
              onClick={() => handleItemClick('overview')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
                activeTab === 'overview'
                  ? 'font-semibold'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              style={
                activeTab === 'overview'
                  ? {
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                      borderColor: 'var(--primary-border)',
                    }
                  : undefined
              }
              title="Tổng quan"
              aria-label="Tổng quan"
            >
              <LayoutDashboard className="w-[18px] h-[18px]" />
            </button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center z-50 pointer-events-none">
              <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1 rounded shadow-lg whitespace-nowrap">
                Tổng quan
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleItemClick('overview')}
            className={`w-full h-10 flex items-center justify-between px-3 rounded-lg text-[14px] font-medium transition-colors group cursor-pointer border ${
              activeTab === 'overview'
                ? 'font-semibold shadow-2xs'
                : 'border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900'
            }`}
            style={
              activeTab === 'overview'
                ? {
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                    borderColor: 'var(--primary-border)',
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
                style={activeTab === 'overview' ? { color: 'var(--primary)' } : undefined}
              >
                <LayoutDashboard className="w-[17px] h-[17px]" />
              </div>
              <span className="truncate">Tổng quan</span>
            </div>
            {activeTab === 'overview' && (
              <div
                className="w-1.5 h-3.5 rounded-full"
                style={{ backgroundColor: 'var(--primary)' }}
              />
            )}
          </button>
        )}

        {/* 2. Quản lý học phần */}
        {collapsed ? (
          <div className="relative group flex justify-center">
            <button
              type="button"
              onClick={() => handleItemClick('courses')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
                activeTab === 'courses'
                  ? 'font-semibold'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              style={
                activeTab === 'courses'
                  ? {
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                      borderColor: 'var(--primary-border)',
                    }
                  : undefined
              }
              title="Quản lý học phần"
              aria-label="Quản lý học phần"
            >
              <BookOpen className="w-[18px] h-[18px]" />
            </button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center z-50 pointer-events-none">
              <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1 rounded shadow-lg whitespace-nowrap">
                Quản lý học phần
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleItemClick('courses')}
            className={`w-full h-10 flex items-center justify-between px-3 rounded-lg text-[14px] font-medium transition-colors group cursor-pointer border ${
              activeTab === 'courses'
                ? 'font-semibold shadow-2xs'
                : 'border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900'
            }`}
            style={
              activeTab === 'courses'
                ? {
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                    borderColor: 'var(--primary-border)',
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
                style={activeTab === 'courses' ? { color: 'var(--primary)' } : undefined}
              >
                <BookOpen className="w-[17px] h-[17px]" />
              </div>
              <span className="truncate">Quản lý học phần</span>
            </div>
            {activeTab === 'courses' && (
              <div
                className="w-1.5 h-3.5 rounded-full"
                style={{ backgroundColor: 'var(--primary)' }}
              />
            )}
          </button>
        )}

        {/* Separator / Group Divider */}
        <div className="pt-2 pb-1">
          <div className="border-t border-slate-100" />
        </div>

        {/* 3. MỤC LỚN: "Ngân hàng Câu hỏi" (2 mục con: Danh sách câu hỏi, Câu hỏi mới) */}
        {collapsed ? (
          <>
            {questionBankGroup.subItems.map((sub) => {
              const SubIcon = sub.icon;
              const isSubActive =
                activeTab === sub.id || (sub.id === 'question-bank' && activeTab === 'ai-generator');
              return (
                <div key={sub.id} className="relative group flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleItemClick(sub.id)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
                      isSubActive
                        ? 'font-semibold'
                        : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    style={
                      isSubActive
                        ? {
                            backgroundColor: 'var(--primary-light)',
                            color: 'var(--primary)',
                            borderColor: 'var(--primary-border)',
                          }
                        : undefined
                    }
                    title={`Ngân hàng: ${sub.label}`}
                    aria-label={`Ngân hàng: ${sub.label}`}
                  >
                    <SubIcon className="w-[18px] h-[18px]" />
                  </button>
                  <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center z-50 pointer-events-none">
                    <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1 rounded shadow-lg whitespace-nowrap flex items-center gap-1.5">
                      <span>{sub.label}</span>
                      {sub.badge && (
                        <span className="text-[10px] px-1 rounded font-bold bg-emerald-500 text-white">
                          {sub.badge}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="space-y-1">
            {/* Group Header */}
            <div
              onClick={() => toggleGroup('questionBank')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                isQuestionBankActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Database
                  className="w-3.5 h-3.5"
                  style={isQuestionBankActive ? { color: 'var(--primary)' } : undefined}
                />
                <span className="tracking-wide">Ngân hàng Câu hỏi</span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                  openGroups.questionBank ? '' : '-rotate-90'
                }`}
              />
            </div>

            {/* Sub-items (2 mục con) */}
            {openGroups.questionBank && (
              <div className="space-y-0.5 pl-2 ml-2 border-l border-slate-200">
                {questionBankGroup.subItems.map((sub) => {
                  const SubIcon = sub.icon;
                  const isSubActive =
                    activeTab === sub.id || (sub.id === 'question-bank' && activeTab === 'ai-generator');

                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleItemClick(sub.id)}
                      className={`w-full h-9 flex items-center justify-between px-2.5 rounded-md text-[13.5px] font-medium transition-colors cursor-pointer border ${
                        isSubActive
                          ? 'font-semibold shadow-2xs'
                          : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                      style={
                        isSubActive
                          ? {
                              backgroundColor: 'var(--primary-light)',
                              color: 'var(--primary)',
                              borderColor: 'var(--primary-border)',
                            }
                          : undefined
                      }
                      title={sub.tooltipDesc}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <SubIcon
                          className="w-4 h-4 shrink-0"
                          style={isSubActive ? { color: 'var(--primary)' } : undefined}
                        />
                        <span className="truncate">{sub.label}</span>
                      </div>
                      {sub.badge && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                            sub.badgeColor || 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {sub.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Separator / Group Divider */}
        <div className="pt-2 pb-1">
          <div className="border-t border-slate-100" />
        </div>

        {/* 4. MỤC LỚN: "Khảo thí & Đề thi" (2 mục con: Quản lý đề thi, Ca thi trực tuyến) */}
        {collapsed ? (
          <>
            {examTestingGroup.subItems.map((sub) => {
              const SubIcon = sub.icon;
              const isSubActive = activeTab === sub.id;
              return (
                <div key={sub.id} className="relative group flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleItemClick(sub.id)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
                      isSubActive
                        ? 'font-semibold'
                        : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    style={
                      isSubActive
                        ? {
                            backgroundColor: 'var(--primary-light)',
                            color: 'var(--primary)',
                            borderColor: 'var(--primary-border)',
                          }
                        : undefined
                    }
                    title={`Khảo thí: ${sub.label}`}
                    aria-label={`Khảo thí: ${sub.label}`}
                  >
                    <SubIcon className="w-[18px] h-[18px]" />
                  </button>
                  <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center z-50 pointer-events-none">
                    <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1 rounded shadow-lg whitespace-nowrap">
                      {sub.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="space-y-1">
            {/* Group Header */}
            <div
              onClick={() => toggleGroup('examTesting')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                isExamTestingActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet
                  className="w-3.5 h-3.5"
                  style={isExamTestingActive ? { color: 'var(--primary)' } : undefined}
                />
                <span className="tracking-wide">Khảo thí & Đề thi</span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                  openGroups.examTesting ? '' : '-rotate-90'
                }`}
              />
            </div>

            {/* Sub-items (2 mục con: Quản lý đề thi, Ca thi trực tuyến) */}
            {openGroups.examTesting && (
              <div className="space-y-0.5 pl-2 ml-2 border-l border-slate-200">
                {examTestingGroup.subItems.map((sub) => {
                  const SubIcon = sub.icon;
                  const isSubActive = activeTab === sub.id;

                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleItemClick(sub.id)}
                      className={`w-full h-9 flex items-center justify-between px-2.5 rounded-md text-[13.5px] font-medium transition-colors cursor-pointer border ${
                        isSubActive
                          ? 'font-semibold shadow-2xs'
                          : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                      style={
                        isSubActive
                          ? {
                              backgroundColor: 'var(--primary-light)',
                              color: 'var(--primary)',
                              borderColor: 'var(--primary-border)',
                            }
                          : undefined
                      }
                      title={sub.tooltipDesc}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <SubIcon
                          className="w-4 h-4 shrink-0"
                          style={isSubActive ? { color: 'var(--primary)' } : undefined}
                        />
                        <span className="truncate">{sub.label}</span>
                      </div>
                      {sub.badge && (
                        <span className="text-[11px] leading-none">
                          {sub.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Separator / Group Divider */}
        <div className="pt-2 pb-1">
          <div className="border-t border-slate-100" />
        </div>

        {/* 5. Cài đặt */}
        {collapsed ? (
          <div className="relative group flex justify-center">
            <button
              type="button"
              onClick={() => handleItemClick('settings')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
                activeTab === 'settings'
                  ? 'font-semibold'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              style={
                activeTab === 'settings'
                  ? {
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                      borderColor: 'var(--primary-border)',
                    }
                  : undefined
              }
              title="Cài đặt"
              aria-label="Cài đặt"
            >
              <Settings className="w-[18px] h-[18px]" />
            </button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center z-50 pointer-events-none">
              <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1 rounded shadow-lg whitespace-nowrap">
                Cài đặt
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleItemClick('settings')}
            className={`w-full h-10 flex items-center justify-between px-3 rounded-lg text-[14px] font-medium transition-colors group cursor-pointer border ${
              activeTab === 'settings'
                ? 'font-semibold shadow-2xs'
                : 'border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900'
            }`}
            style={
              activeTab === 'settings'
                ? {
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                    borderColor: 'var(--primary-border)',
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
                style={activeTab === 'settings' ? { color: 'var(--primary)' } : undefined}
              >
                <Settings className="w-[17px] h-[17px]" />
              </div>
              <span className="truncate">Cài đặt</span>
            </div>
            {activeTab === 'settings' && (
              <div
                className="w-1.5 h-3.5 rounded-full"
                style={{ backgroundColor: 'var(--primary)' }}
              />
            )}
          </button>
        )}
      </div>

      {/* AI Generator Quota Card (Compact) */}
      {!collapsed ? (
        <div className="px-3 py-2.5 mx-3 mb-2 rounded-lg bg-slate-50 border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-1">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
              AI Generator
            </span>
            <span className="text-[11px] text-slate-500 font-medium">86/200</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 rounded-full w-[43%]"
              style={{ backgroundColor: 'var(--primary)' }}
            />
          </div>
          <div className="mt-1 flex justify-between items-center text-[10px] text-slate-500">
            <span>Hạn mức tháng</span>
            <button
              type="button"
              className="font-semibold cursor-pointer hover:underline"
              style={{ color: 'var(--primary)' }}
              onClick={onOpenAIGenerator}
            >
              Tạo thêm
            </button>
          </div>
        </div>
      ) : (
        <div className="px-2 pb-2 flex justify-center">
          <button
            type="button"
            onClick={onOpenAIGenerator}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer border"
            style={{
              backgroundColor: 'var(--primary-light)',
              borderColor: 'var(--primary-border)',
              color: 'var(--primary)',
            }}
            title="AI Generator (86/200 câu)"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bottom Section: Logout */}
      <div className={`p-2 border-t border-slate-100 ${collapsed ? 'px-2' : 'px-3'}`}>
        {collapsed ? (
          <div className="relative group flex justify-center">
            <button
              type="button"
              onClick={onLogout}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Đăng xuất"
              aria-label="Đăng xuất"
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center z-50 pointer-events-none">
              <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1 rounded shadow-lg whitespace-nowrap">
                Đăng xuất
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            className="w-full h-10 flex items-center gap-2.5 px-3 rounded-lg text-[14px] font-medium text-rose-600 hover:bg-rose-50/80 transition-colors cursor-pointer"
          >
            <LogOut className="w-[18px] h-[18px] text-rose-500" />
            <span>Đăng xuất</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside
        className={`hidden lg:block h-screen fixed left-0 top-0 z-30 flex-shrink-0 transition-[width] duration-200 ${
          isCollapsed ? 'w-[76px]' : 'w-[235px]'
        }`}
      >
        {renderContent(isCollapsed)}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={onMobileClose}
          />
          <div className="relative w-[235px] max-w-[85vw] h-full shadow-xl z-10">
            {renderContent(false)}
          </div>
        </div>
      )}
    </>
  );
};
