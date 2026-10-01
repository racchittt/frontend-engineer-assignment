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

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Design Tool Viewer</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
        {screens.map((screen) => (
          <div key={screen.id}>
            <h3>{screen.name}</h3>
            <iframe
              src={screen.url}
              width="1280"
              height="800"
              style={{ border: '1px solid #ccc' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
