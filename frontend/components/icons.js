import React from 'react';
import {
  Shield,
  Eye,
  EyeOff,
  Mail,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  CheckCheck,
  Paperclip,
  Send,
  Bell,
  HelpCircle,
  LogOut,
  MessageSquare,
  Settings,
  ShieldCheck,
  Info,
  Globe,
  Activity,
  Key,
  Timer,
  Lock,
  Smile,
  Mic,
  X,
  Check,
  UserCheck,
  UserPlus,
} from 'lucide-react-native';

export function ShieldIcon({ size = 24, color = '#2563EB' }) {
  return <Shield size={size} color={color} />;
}

export function EyeIcon({ size = 18, color = '#64748B', off = false }) {
  return off ? <EyeOff size={size} color={color} /> : <Eye size={size} color={color} />;
}

export function MailIcon({ size = 24, color = '#2563EB' }) {
  return <Mail size={size} color={color} />;
}

export function SearchIcon({ size = 16, color = '#64748B' }) {
  return <Search size={size} color={color} />;
}

export function PlusIcon({ size = 18, color = '#2563EB' }) {
  return <Plus size={size} color={color} />;
}

export function ChevronLeftIcon({ size = 20, color = '#64748B' }) {
  return <ChevronLeft size={size} color={color} />;
}

export function ChevronRightIcon({ size = 16, color = '#64748B' }) {
  return <ChevronRight size={size} color={color} />;
}

export function MoreVerticalIcon({ size = 20, color = '#64748B' }) {
  return <MoreVertical size={size} color={color} />;
}

export function DoubleCheckIcon({ size = 14, color = '#2563EB' }) {
  return <CheckCheck size={size} color={color} />;
}

export function PaperclipIcon({ size = 18, color = '#64748B' }) {
  return <Paperclip size={size} color={color} />;
}

export function SendIcon({ size = 16, color = '#FFFFFF' }) {
  return <Send size={size} color={color} />;
}

export function BellIcon({ size = 18, color = '#64748B' }) {
  return <Bell size={size} color={color} />;
}

export function HelpIcon({ size = 18, color = '#64748B' }) {
  return <HelpCircle size={size} color={color} />;
}

export function LogOutIcon({ size = 16, color = '#EF4444' }) {
  return <LogOut size={size} color={color} />;
}

export function ChatBubbleIcon({ size = 22, color = '#64748B', focused = false }) {
  return <MessageSquare size={size} color={color} />;
}

export function GearIcon({ size = 22, color = '#64748B', focused = false }) {
  return <Settings size={size} color={color} />;
}

export function ShieldCheckIcon({ size = 20, color = '#22C55E' }) {
  return <ShieldCheck size={size} color={color} />;
}

export function InfoIcon({ size = 20, color = '#64748B' }) {
  return <Info size={size} color={color} />;
}

export function GlobeIcon({ size = 20, color = '#22C55E' }) {
  return <Globe size={size} color={color} />;
}

export function ActivityIcon({ size = 20, color = '#22C55E' }) {
  return <Activity size={size} color={color} />;
}

export function KeyIcon({ size = 20, color = '#22C55E' }) {
  return <Key size={size} color={color} />;
}

export function TimerIcon({ size = 20, color = '#64748B' }) {
  return <Timer size={size} color={color} />;
}

export function LockIcon({ size = 16, color = '#64748B' }) {
  return <Lock size={size} color={color} />;
}

export function SmileIcon({ size = 20, color = '#64748B' }) {
  return <Smile size={size} color={color} />;
}

export function MicIcon({ size = 20, color = '#64748B' }) {
  return <Mic size={size} color={color} />;
}

export function XIcon({ size = 18, color = '#EF4444' }) {
  return <X size={size} color={color} />;
}

export function CheckIcon({ size = 18, color = '#22C55E' }) {
  return <Check size={size} color={color} />;
}

export function UserCheckIcon({ size = 18, color = '#22C55E' }) {
  return <UserCheck size={size} color={color} />;
}

export function UserPlusIcon({ size = 18, color = '#2563EB' }) {
  return <UserPlus size={size} color={color} />;
}
