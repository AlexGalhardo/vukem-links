"use client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { BarChart3, Plus, LogOut, FolderTree, Menu, X } from "lucide-react"
import { useState, useEffect } from "react"
import { ThemeToggle } from "./theme-toggle" // Importar o ThemeToggle
import { useRouter } from "next/navigation" // Manter useRouter para logout

interface AdminSidebarProps {
  onCreateMasterCategory: () => void
  onCreateCategory: () => void
  onCreateSubcategory: () => void
  onCreateLink: () => void
}

const navigation = [
  {
    name: "Nova Categoria Master",
    action: "createMasterCategory",
    icon: FolderTree,
  },
  {
    name: "Nova Categoria",
    action: "createCategory",
    icon: Plus,
  },
  {
    name: "Nova Subcategoria",
    action: "createSubcategory",
    icon: Plus,
  },
  {
    name: "Novo Link",
    action: "createLink",
    icon: Plus,
  },
]

export function AdminSidebar({
  onCreateMasterCategory,
  onCreateCategory,
  onCreateSubcategory,
  onCreateLink,
}: AdminSidebarProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const actionHandlers = {
    createMasterCategory: onCreateMasterCategory,
    createCategory: onCreateCategory,
    createSubcategory: onCreateSubcategory,
    createLink: onCreateLink,
  }

  const handleLogout = () => {
    document.cookie = "auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT"
    router.push("/login")
  }

  // Fecha o sidebar em telas maiores que md
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(false)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden fixed top-4 left-4 z-50 bg-background border"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsOpen(false)} />}

      <div
        className={cn(
          "flex flex-col bg-card border-r transition-transform duration-300 ease-in-out z-40",
          "fixed md:relative h-full w-64",
          "md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-center h-16 border-b">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            <h1 className="text-xl font-bold">Affiliate Manager</h1>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <div className="mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ações Rápidas</h2>
          </div>
          {navigation.map((item) => (
            <button
              key={item.name}
              onClick={() => actionHandlers[item.action as keyof typeof actionHandlers]()}
              className={cn(
                "flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <item.icon className="mr-3 h-4 w-4" />
              {item.name}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tema</span>
            <ThemeToggle />
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="mr-3 h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </>
  )
}
