import React, { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, 
  MessageSquare, 
  Users, 
  Phone, 
  MapPin, 
  Mic, 
  Battery, 
  Wifi, 
  HardDrive,
  Clock,
  MoreVertical,
  Settings,
  ShieldCheck,
  Activity,
  Image as ImageIcon,
  Download,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';

// --- Firebase Imports & Initialization ---
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { getDatabase, ref, onValue } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app, firebaseConfig.databaseURL);

// --- Types ---

enum Section {
  STATUS = 'status',
  SMS = 'sms',
  CONTACTS = 'contacts',
  CALLS = 'calls',
  LOCATION = 'location',
  GALLERY = 'gallery',
  AUDIO = 'audio'
}

interface Message {
  id: string;
  sender: string;
  preview: string;
  time: string;
  unread: boolean;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  type: string;
}

interface CallLog {
  id: string;
  number: string;
  type: 'incoming' | 'outgoing' | 'missed';
  time: string;
  duration: string;
}

interface MediaFile {
  id: string;
  url: string;
  name: string;
  size: string;
  date: string;
}

interface DeviceState {
  battery: number;
  isCharging: boolean;
  uptime: string;
  storage: string;
  temp: number;
  signal: string;
}

// --- Components ---

const StatusCard = ({ icon: Icon, label, value, subtext, color = 'blue' }: any) => (
  <div className="bg-[#1c1c1e] border border-[#2c2c2e] p-4 rounded-xl flex flex-col justify-between hover:border-blue-500/50 transition-colors group">
    <div className="flex justify-between items-start">
      <div className={`p-2 rounded-lg bg-${color}-500/10 text-${color}-500`}>
        <Icon size={20} />
      </div>
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Active</div>
    </div>
    <div className="mt-4">
      <div className="text-zinc-400 text-xs font-medium">{label}</div>
      <div className="text-2xl font-semibold text-white mt-1">{value}</div>
      <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-tighter">{subtext}</div>
    </div>
  </div>
);

const SectionHeader = ({ title, description }: { title: string; description: string }) => (
  <div className="mb-6">
    <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
    <p className="text-sm text-zinc-500">{description}</p>
  </div>
);

// --- Main App ---

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>(Section.STATUS);
  const [deviceState, setDeviceState] = useState<DeviceState>({
    battery: 0,
    isCharging: false,
    uptime: 'N/A',
    storage: '0 GB',
    temp: 0,
    signal: 'N/A'
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [gallery, setGallery] = useState<MediaFile[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isMicActive, setIsMicActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const streamRef = useRef<MediaStream | null>(null);

  // Sync Real-Time Data from Firebase
  useEffect(() => {
    try {
      // 1. Device Status from RTDB
      const statusRef = ref(rtdb, 'device/status');
      const unsubscribeStatus = onValue(statusRef, (snapshot) => {
        const data = snapshot.val();
        if (data) setDeviceState(data);
      }, (err) => setErrorMsg('Firebase Status Error: ' + err.message));

      // 2. Monitoring collections from Firestore
      const smsQuery = query(collection(db, 'sms'), orderBy('timestamp', 'desc'), limit(50));
      const unsubscribeSms = onSnapshot(smsQuery, (snapshot) => {
        setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
      });

      const contactsQuery = query(collection(db, 'contacts'), orderBy('name', 'asc'));
      const unsubscribeContacts = onSnapshot(contactsQuery, (snapshot) => {
        setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
      });

      const callsQuery = query(collection(db, 'calls'), orderBy('timestamp', 'desc'), limit(50));
      const unsubscribeCalls = onSnapshot(callsQuery, (snapshot) => {
        setCalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallLog)));
      });

      const galleryQuery = query(collection(db, 'gallery'), orderBy('timestamp', 'desc'));
      const unsubscribeGallery = onSnapshot(galleryQuery, (snapshot) => {
        setGallery(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MediaFile)));
      });

      const locationRef = ref(rtdb, 'device/location');
      const unsubscribeLocation = onValue(locationRef, (snapshot) => {
        const data = snapshot.val();
        if (data) setUserLocation({ lat: data.lat, lng: data.lng });
      });

      return () => {
        unsubscribeStatus();
        unsubscribeSms();
        unsubscribeContacts();
        unsubscribeCalls();
        unsubscribeGallery();
        unsubscribeLocation();
        streamRef.current?.getTracks().forEach(track => track.stop());
      };
    } catch (err: any) {
      setErrorMsg('Firebase Init Error: ' + err.message);
    }
  }, []);

  const toggleMic = async () => {
    if (isMicActive) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      setIsMicActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        setIsMicActive(true);
      } catch (err) {
        alert('Izin mikrofon ditolak');
      }
    }
  };

  const menuItems = [
    { id: Section.STATUS, label: 'Status', icon: Smartphone },
    { id: Section.SMS, label: 'SMS', icon: MessageSquare },
    { id: Section.CONTACTS, label: 'Kontak', icon: Users },
    { id: Section.CALLS, label: 'Panggilan', icon: Phone },
    { id: Section.LOCATION, label: 'Lokasi', icon: MapPin },
    { id: Section.GALLERY, label: 'Galeri Foto', icon: ImageIcon },
    { id: Section.AUDIO, label: 'Audio Mikrofon', icon: Mic },
  ];

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-blue-500/30">
      {/* Sidebar */}
      <aside className="w-64 bg-[#141414] border-r border-[#2c2c2e] flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3 text-white mb-8">
            <div className="bg-blue-600 p-2 rounded-lg">
              <ShieldCheck size={20} />
            </div>
            <span className="font-bold text-lg tracking-tight uppercase">DroidDash</span>
          </div>

          <nav className="space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200 ${
                  activeSection === item.id 
                    ? 'bg-blue-600/10 text-blue-500 font-medium' 
                    : 'hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-[#2c2c2e] bg-[#1a1a1c]">
           {errorMsg && (
             <div className="mb-4 bg-red-500/10 border border-red-500/20 p-2 rounded flex items-center gap-2 text-[10px] text-red-500">
               <AlertCircle size={12} />
               {errorMsg}
             </div>
           )}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold">
              ID
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-white truncate">W8 Dashboard</div>
              <div className="text-[10px] text-zinc-500 truncate">{deviceState.signal || 'Menghubungkan...'}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-[#0a0a0a]">
        <header className="h-16 border-b border-[#2c2c2e] bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-zinc-500 uppercase">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live Device Stream
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 group cursor-help">
              <Battery size={16} className={deviceState.battery < 20 ? 'text-red-500' : 'text-zinc-400'} />
              <span className="text-xs font-mono">{deviceState.battery}%</span>
            </div>
            <div className="flex items-center gap-2">
              <Wifi size={16} className="text-zinc-400" />
              <span className="text-xs font-mono">{deviceState.signal}</span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <button className="text-zinc-400 hover:text-white transition-colors">
              <Settings size={18} />
            </button>
          </div>
        </header>

        <div className="p-8 max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeSection === Section.STATUS && (
                <div className="space-y-8">
                  <SectionHeader title="Status Perangkat" description="Pantau metrik sistem dan kesehatan perangkat secara real-time dari database." />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatusCard icon={Battery} label="Baterai" value={`${deviceState.battery}%`} subtext={deviceState.isCharging ? 'Status: Mengisi' : 'Status: Discharge'} color="green" />
                    <StatusCard icon={Clock} label="Uptime" value={deviceState.uptime} subtext="Lama Aktif" color="blue" />
                    <StatusCard icon={HardDrive} label="Penyimpanan" value={deviceState.storage} subtext="Total Penggunaan" color="purple" />
                    <StatusCard icon={Activity} label="Monitoring" value={`${deviceState.temp}°C`} subtext="Suhu Inti" color="orange" />
                  </div>
                </div>
              )}

              {activeSection === Section.SMS && (
                <div>
                  <SectionHeader title="Pesan SMS" description="Riwayat pesan masuk yang disinkronkan secara otomatis ke dashboard." />
                  <div className="bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl overflow-hidden divide-y divide-[#2c2c2e]">
                    {messages.length > 0 ? messages.map((msg) => (
                      <div key={msg.id} className="p-4 hover:bg-zinc-800/20 flex gap-4 cursor-pointer transition-colors group">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${msg.unread ? 'bg-blue-600/20 text-blue-500' : 'bg-zinc-800 text-zinc-500'}`}>
                          <MessageSquare size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-white truncate">{msg.sender}</span>
                            <span className="text-[10px] text-zinc-500 uppercase">{msg.time}</span>
                          </div>
                          <p className="text-sm text-zinc-500 truncate group-hover:text-zinc-400 transition-colors">{msg.preview}</p>
                        </div>
                        {msg.unread && <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />}
                      </div>
                    )) : (
                      <div className="p-12 text-center text-zinc-500 text-sm">Belum ada data SMS masuk.</div>
                    )}
                  </div>
                </div>
              )}

              {activeSection === Section.CONTACTS && (
                <div>
                  <SectionHeader title="Kontak Perangkat" description="Daftar kontak yang tersinkronisasi dari memori ponsel." />
                  <div className="bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#252529] text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                          <th className="px-6 py-4">Nama</th>
                          <th className="px-6 py-4">Telepon</th>
                          <th className="px-6 py-4">Kategori</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2c2c2e]">
                        {contacts.length > 0 ? contacts.map((contact) => (
                          <tr key={contact.id} className="hover:bg-zinc-800/20 transition-colors text-sm">
                            <td className="px-6 py-4 text-white font-medium">{contact.name}</td>
                            <td className="px-6 py-4 font-mono text-zinc-400">{contact.phone}</td>
                            <td className="px-6 py-4">
                              <span className="bg-zinc-800 text-zinc-400 px-2 py-1 rounded text-[10px] uppercase font-bold tracking-tighter">
                                {contact.type}
                              </span>
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan={3} className="px-6 py-12 text-center text-zinc-500">Tidak ada kontak ditemukan.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSection === Section.CALLS && (
                <div>
                  <SectionHeader title="Log Panggilan" description="Sinkronisasi riwayat telepon masuk dan keluar." />
                  <div className="bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl overflow-hidden divide-y divide-[#2c2c2e]">
                    {calls.length > 0 ? calls.map((call) => (
                      <div key={call.id} className="p-4 hover:bg-zinc-800/20 flex items-center justify-between transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${
                            call.type === 'missed' ? 'bg-red-500/10 text-red-500' : 
                            call.type === 'incoming' ? 'bg-green-500/10 text-green-500' : 
                            'bg-blue-500/10 text-blue-500'
                          }`}>
                            <Phone size={18} />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white">{call.number}</div>
                            <div className="text-[10px] uppercase tracking-tighter text-zinc-500 flex items-center gap-2">
                              {call.type === 'missed' ? 'Panggilan Tak Terjawab' : call.type === 'incoming' ? 'Panggilan Masuk' : 'Panggilan Keluar'}
                              <span className="w-1 h-1 rounded-full bg-zinc-700" />
                              {call.time}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs font-mono text-zinc-500">{call.duration}</div>
                      </div>
                    )) : (
                      <div className="p-12 text-center text-zinc-500">Log panggilan kosong.</div>
                    )}
                  </div>
                </div>
              )}

              {activeSection === Section.LOCATION && (
                <div className="h-[600px] rounded-2xl overflow-hidden border border-[#2c2c2e] relative shadow-2xl">
                  {GOOGLE_MAPS_KEY ? (
                    <APIProvider apiKey={GOOGLE_MAPS_KEY} version="weekly">
                      <Map
                        defaultCenter={userLocation || { lat: -6.2088, lng: 106.8456 }}
                        defaultZoom={15}
                        mapId="DEMO_MAP_ID"
                        disableDefaultUI={true}
                        style={{ width: '100%', height: '100%' }}
                      >
                        {userLocation && (
                          <AdvancedMarker position={userLocation}>
                            <Pin background="#3b82f6" glyphColor="#fff" borderColor="#1e40af" />
                          </AdvancedMarker>
                        )}
                      </Map>
                      <div className="absolute top-4 left-4 z-10">
                        <div className="bg-[#1c1c1e]/90 backdrop-blur-md p-3 rounded-xl border border-[#2c2c2e] shadow-xl max-w-xs">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Live Location Cloud Ref</h4>
                          <div className="font-mono text-xs text-white">
                            {userLocation ? `${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}` : 'Sinkronisasi koordinat...'}
                          </div>
                        </div>
                      </div>
                    </APIProvider>
                  ) : (
                    <div className="w-full h-full bg-[#1c1c1e] flex flex-col items-center justify-center text-center p-8">
                       <MapPin size={48} className="text-zinc-700 mb-4" />
                       <h3 className="text-white font-bold text-lg mb-2">Google Maps API Key Diperlukan</h3>
                       <p className="text-zinc-500 text-sm max-w-sm">
                         Tambahkan Key untuk melihat pelacakan lokasi real-time.
                       </p>
                    </div>
                  )}
                </div>
              )}

              {activeSection === Section.GALLERY && (
                <div className="space-y-6">
                  <SectionHeader title="Galeri Media" description="Foto yang tersimpan secara lokal dan tersinkronisasi ke Cloud Storage." />
                  {gallery.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {gallery.map((file) => (
                        <div key={file.id} className="group relative bg-[#1c1c1e] border border-[#2c2c2e] rounded-xl overflow-hidden hover:border-blue-500/50 transition-all">
                          <img src={file.url} alt={file.name} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                            <p className="text-[10px] font-bold text-white truncate mb-1">{file.name}</p>
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] text-zinc-400 font-mono">{file.size}</span>
                              <button className="p-1.5 bg-blue-600 rounded-lg text-white hover:bg-blue-700 transition-colors">
                                <Download size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-24 text-center border-2 border-dashed border-[#2c2c2e] rounded-2xl text-zinc-600">
                      Belum ada media tersinkronisasi.
                    </div>
                  )}
                </div>
              )}

              {activeSection === Section.AUDIO && (
                <div className="space-y-8">
                  <SectionHeader title="Audio Mikrofon" description="Akses input suara perangkat secara langsung melalui web receiver." />
                  <div className="max-w-2xl mx-auto">
                    <div className="space-y-4">
                       <div className="flex items-center justify-between">
                        <h3 className="font-bold text-white flex items-center gap-2"><Mic size={18} /> Monitor Audio</h3>
                        <button 
                          onClick={toggleMic}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                            isMicActive ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20'
                          }`}
                        >
                          {isMicActive ? 'Hentikan Monitor' : 'Aktifkan Mikrofon'}
                        </button>
                      </div>
                      <div className="aspect-video bg-[#1c1c1e] rounded-2xl border-2 border-[#2c2c2e] overflow-hidden p-8 flex flex-col items-center justify-center gap-8 shadow-inner">
                        <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${
                          isMicActive ? 'bg-blue-600/10 scale-110 shadow-[0_0_50px_rgba(59,130,246,0.3)]' : 'bg-zinc-800'
                        }`}>
                          <Mic size={40} className={isMicActive ? 'text-blue-500' : 'text-zinc-600'} />
                        </div>
                        <div className="w-full space-y-2">
                          <div className="flex justify-between text-[10px] uppercase font-mono tracking-tighter text-zinc-500">
                             <span>Audio Capture Level</span>
                             <span>{isMicActive ? '-12 dB' : '-Infinity'}</span>
                          </div>
                          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                             <motion.div 
                               initial={{ width: 0 }}
                               animate={{ width: isMicActive ? '65%' : '0%' }}
                               className={`h-full transition-all duration-75 ${isMicActive ? 'bg-blue-500' : 'bg-zinc-700'}`}
                             />
                          </div>
                        </div>
                        <p className="text-xs text-zinc-500 font-medium italic">
                          {isMicActive ? 'Menerima streaming audio dari perangkat...' : 'Web audio receiver standby.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
