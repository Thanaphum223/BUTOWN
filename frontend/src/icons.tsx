import type { HTMLAttributes } from "react";
import {
  ArrowLeft,
  Bell,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CirclePlay,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  History,
  House,
  Image,
  LayoutGrid,
  Lock,
  LogOut,
  MapPin,
  Menu,
  Minus,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Settings,
  ShieldCheck,
  Star,
  ThumbsUp,
  Trash,
  TriangleAlert,
  Trophy,
  Upload,
  User,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

// Lucide glyphs under the AntD names so every screen shares one icon set; the anticon wrapper
// keeps AntD button/menu spacing and the role="img" labels the tests and screen readers rely on.
function icon(Glyph: LucideIcon, label: string, filled = false) {
  const Icon = ({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) => (
    <span
      role="img"
      aria-label={label}
      {...rest}
      className={["anticon", "tt-icon", className].filter(Boolean).join(" ")}
    >
      <Glyph
        size="1em"
        strokeWidth={2}
        fill={filled ? "currentColor" : "none"}
        aria-hidden
        focusable={false}
      />
    </span>
  );
  Icon.displayName = label;
  return Icon;
}

export const AlertOutlined = icon(TriangleAlert, "alert");
export const ArrowLeftOutlined = icon(ArrowLeft, "arrow-left");
export const BellOutlined = icon(Bell, "bell");
export const CalendarOutlined = icon(Calendar, "calendar");
export const CameraOutlined = icon(Camera, "camera");
export const CheckCircleOutlined = icon(CircleCheck, "check-circle");
export const CheckOutlined = icon(Check, "check");
export const ClockCircleOutlined = icon(Clock, "clock-circle");
export const CloseOutlined = icon(X, "close");
export const DashboardOutlined = icon(LayoutGrid, "dashboard");
export const DeleteOutlined = icon(Trash, "delete");
export const DownloadOutlined = icon(Download, "download");
export const EditOutlined = icon(Pencil, "edit");
export const EnvironmentOutlined = icon(MapPin, "environment");
export const EyeOutlined = icon(Eye, "eye");
export const FilePdfOutlined = icon(FileText, "file-pdf");
export const FileTextOutlined = icon(FileText, "file-text");
export const FilterOutlined = icon(Filter, "filter");
export const HistoryOutlined = icon(History, "history");
export const HomeOutlined = icon(House, "home");
export const LeftOutlined = icon(ChevronLeft, "left");
export const LikeOutlined = icon(ThumbsUp, "like");
export const LockOutlined = icon(Lock, "lock");
export const LogoutOutlined = icon(LogOut, "logout");
export const MenuOutlined = icon(Menu, "menu");
export const MinusOutlined = icon(Minus, "minus");
export const PaperClipOutlined = icon(Paperclip, "paper-clip");
export const PhoneOutlined = icon(Phone, "phone");
export const PictureOutlined = icon(Image, "picture");
export const PlayCircleOutlined = icon(CirclePlay, "play-circle");
export const PlusOutlined = icon(Plus, "plus");
export const RightOutlined = icon(ChevronRight, "right");
export const SafetyCertificateOutlined = icon(ShieldCheck, "safety-certificate");
export const SettingOutlined = icon(Settings, "setting");
export const StarFilled = icon(Star, "star", true);
export const StarOutlined = icon(Star, "star");
export const TeamOutlined = icon(Users, "team");
export const TrophyOutlined = icon(Trophy, "trophy");
export const UploadOutlined = icon(Upload, "upload");
export const UserAddOutlined = icon(UserPlus, "user-add");
export const UserOutlined = icon(User, "user");
