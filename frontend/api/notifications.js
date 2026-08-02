import * as Notifications from 'expo-notifications';

// Show banners even while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function showMessageNotification(senderName, body, senderId) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: senderName,
      body,
      sound: true,
      color: '#1258B4',
      data: { senderId, senderName },
    },
    trigger: null,
  });
}
