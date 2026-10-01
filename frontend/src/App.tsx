import { useEffect, useState } from 'react';
import { initAgent } from './agent/agent';

interface Screen {
  id: string;
  name: string;
  url: string;
}

function App() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('http://localhost:4000/screens');
        const data = await res.json();
        setScreens(data);
        console.log(`Loaded ${data.length} screens`);
      } catch (err) {
        console.error('Failed to load screens:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Initialize agent communication after iframes are mounted
  useEffect(() => {
    if (screens.length > 0) {
      setTimeout(() => initAgent(), 100); // Let iframes load first
    }
  }, [screens]);

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <div className="w-full bg-[#fdfcfa] min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8">Design Tool Viewer</h1>
      <div className="grid grid-cols-2 gap-6">
        {screens.map((screen) => (
          <div key={screen.id} className="flex flex-col">
            <h3 className="text-lg font-semibold mb-2">{screen.name}</h3>
            <iframe
              src={screen.url}
              width="1280"
              height="800"
              className="border border-gray-300 rounded"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
