import { Ionicons } from '@expo/vector-icons';

export function ShieldIcon({ size = 24, color = '#4FB8AE' }) {
  return <Ionicons name="lock-closed-outline" size={size} color={color} />;
}

export function EyeIcon({ size = 18, color = '#5B6572', off = false }) {
  return <Ionicons name={off ? 'eye-off-outline' : 'eye-outline'} size={size} color={color} />;
}

export function MailIcon({ size = 24, color = '#4FB8AE' }) {
  return <Ionicons name="mail-outline" size={size} color={color} />;
}

export function SearchIcon({ size = 16, color = '#5B6572' }) {
  return <Ionicons name="search-outline" size={size} color={color} />;
}

export function PlusIcon({ size = 18, color = '#4FB8AE' }) {
  return <Ionicons name="add" size={size} color={color} />;
}

export function ChevronLeftIcon({ size = 20, color = '#8B97A5' }) {
  return <Ionicons name="chevron-back" size={size} color={color} />;
}

export function ChevronRightIcon({ size = 16, color = '#5B6572' }) {
  return <Ionicons name="chevron-forward" size={size} color={color} />;
}

export function MoreVerticalIcon({ size = 20, color = '#8B97A5' }) {
  return <Ionicons name="ellipsis-vertical" size={size} color={color} />;
}

export function DoubleCheckIcon({ size = 14, color = '#4FB8AE' }) {
  return <Ionicons name="checkmark-done" size={size} color={color} />;
}

export function PaperclipIcon({ size = 18, color = '#8B97A5' }) {
  return <Ionicons name="attach-outline" size={size} color={color} />;
}

export function SendIcon({ size = 16, color = '#0B0F13' }) {
  return <Ionicons name="send" size={size} color={color} />;
}

export function BellIcon({ size = 18, color = '#8B97A5' }) {
  return <Ionicons name="notifications-outline" size={size} color={color} />;
}

export function HelpIcon({ size = 18, color = '#8B97A5' }) {
  return <Ionicons name="help-circle-outline" size={size} color={color} />;
}

export function LogOutIcon({ size = 16, color = '#C97A73' }) {
  return <Ionicons name="log-out-outline" size={size} color={color} />;
}

export function ChatBubbleIcon({ size = 22, color = '#8B97A5', focused = false }) {
  return <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={size} color={color} />;
}

export function GearIcon({ size = 22, color = '#8B97A5', focused = false }) {
  return <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />;
}
