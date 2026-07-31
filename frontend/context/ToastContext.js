import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { XIcon, CheckIcon, ShieldCheckIcon } from '../components/icons';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [fadeAnim] = useState(new Animated.Value(0));

  const dismissToast = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setToast(null);
    });
  }, [fadeAnim]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Auto dismiss
    const timer = setTimeout(() => {
      dismissToast();
    }, 3500);

    return () => clearTimeout(timer);
  }, [fadeAnim, dismissToast]);

  const contextValue = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toast && (
        <Animated.View
          style={[
            styles.toastContainer,
            styles[toast.type],
            { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }
          ]}
        >
          <View style={styles.toastContent}>
            {toast.type === 'success' && <CheckIcon size={18} color="#FFFFFF" />}
            {toast.type === 'error' && <XIcon size={18} color="#FFFFFF" />}
            {toast.type === 'warning' && <ShieldCheckIcon size={18} color="#FFFFFF" />}
            <Text style={styles.toastText}>{toast.message}</Text>
          </View>
          <Pressable onPress={dismissToast} hitSlop={10} style={styles.closeBtn}>
            <XIcon size={14} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 9999,
  },
  success: {
    backgroundColor: '#22C55E',
  },
  error: {
    backgroundColor: '#EF4444',
  },
  warning: {
    backgroundColor: '#F59E0B',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  closeBtn: {
    padding: 2,
  },
});
