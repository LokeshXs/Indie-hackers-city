import { CityMap3D } from "@/components/city-map/CityMap3D";
import { starterDistrict } from "@/components/city-map/map-data";

export default function Home() {
  return <CityMap3D district={starterDistrict} />;
}
