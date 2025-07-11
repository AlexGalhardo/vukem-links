"use client";

import React from "react";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AdminSidebar } from "./AdminSidebar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
	Package,
	Smartphone,
	Pill,
	BookOpen,
	Book,
	Gamepad2,
	Sparkles,
	Copy,
	ExternalLink,
	RefreshCcw,
	Edit,
	Trash2,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import {
	createCategory,
	createLink,
	createMasterCategory,
	createSubcategory,
	getCategoriesWithDetails,
	getLinksWithDetails,
	getMasterCategoriesWithDetails,
	getSubcategoriesWithDetails,
	getTotalRedirects,
	getRedirectsLast7Days,
	getRedirectsLast30Days,
	updateLink,
	deleteLink,
	updateSubcategoryBitlyUrl, // Importar nova ação
	deleteSubcategoryBitlyUrl, // Importar nova ação
} from "@/app/actions";

interface MasterCategory {
	id: string;
	name: string;
	slug: string;
	createdAt: Date;
	categories?: Category[];
	totalRedirects?: number;
}

interface Category {
	id: string;
	name: string;
	slug: string;
	masterCategoryId: string;
	createdAt: Date;
	subcategories?: Subcategory[];
	totalRedirects?: number;
}

interface Subcategory {
	id: string;
	name: string;
	slug: string;
	categoryId: string;
	bitlyUrl?: string | null; // Adicionado bitlyUrl
	createdAt: Date;
	_count?: {
		links: number;
	};
	totalRedirects?: number;
}

interface Link {
	id: string;
	url: string;
	clicks: number;
	subcategoryId: string;
	createdAt: Date;
	subcategory?: {
		name: string;
		slug: string;
		category: {
			name: string;
			slug: string;
			masterCategory: {
				name: string;
				slug: string;
			};
		};
	};
}

const categoryIcons = {
	"produtos-casa": Package,
	eletronicos: Smartphone,
	suplementos: Pill,
	ebooks: BookOpen,
	"livros-fisicos": Book,
	"jogos-videogame": Gamepad2,
	perfumes: Sparkles,
};

export default function AdminDashboard() {
	const [masterCategories, setMasterCategories] = useState<MasterCategory[]>([]);
	const [categories, setCategories] = useState<Category[]>([]);
	const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
	const [links, setLinks] = useState<Link[]>([]);
	const [totalRedirects, setTotalRedirects] = useState(0);
	const [redirectsLast7Days, setRedirectsLast7Days] = useState(0);
	const [redirectsLast30Days, setRedirectsLast30Days] = useState(0);
	const [isLoading, setIsLoading] = useState(true);

	// Dialog states
	const [isMasterCategoryDialogOpen, setIsMasterCategoryDialogOpen] = useState(false);
	const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
	const [isSubcategoryDialogOpen, setIsSubcategoryDialogOpen] = useState(false);
	const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isBitlyEditDialogOpen, setIsBitlyEditDialogOpen] = useState(false); // Novo
	const [isBitlyDeleteDialogOpen, setIsBitlyDeleteDialogOpen] = useState(false); // Novo

	// Form states
	const [newMasterCategory, setNewMasterCategory] = useState({ name: "", slug: "" });
	const [newCategory, setNewCategory] = useState({ name: "", slug: "", masterCategoryId: "" });
	const [newSubcategory, setNewSubcategory] = useState({ name: "", slug: "", categoryId: "" });
	const [newLink, setNewLink] = useState({ url: "", subcategoryId: "" });
	const [selectedLink, setSelectedLink] = useState<Link | null>(null);
	const [editedLinkUrl, setEditedLinkUrl] = useState("");
	const [selectedSubcategoryForBitly, setSelectedSubcategoryForBitly] = useState<Subcategory | null>(null); // Novo
	const [editedBitlyUrl, setEditedBitlyUrl] = useState(""); // Novo

	const [currentPage, setCurrentPage] = useState(1);
	const linksPerPage = 10;

	const { toast } = useToast();

	useEffect(() => {
		fetchData();
	}, []);

	const fetchData = async () => {
		try {
			const [
				masterCategoriesData,
				categoriesData,
				subcategoriesData,
				linksData,
				totalRedirectsData,
				redirects7DaysData,
				redirects30DaysData,
			] = await Promise.all([
				getMasterCategoriesWithDetails(),
				getCategoriesWithDetails(),
				getSubcategoriesWithDetails(),
				getLinksWithDetails(),
				getTotalRedirects(),
				getRedirectsLast7Days(),
				getRedirectsLast30Days(),
			]);

			setMasterCategories(masterCategoriesData);
			setCategories(categoriesData);
			setSubcategories(subcategoriesData);
			setLinks(linksData);
			setTotalRedirects(totalRedirectsData);
			setRedirectsLast7Days(redirects7DaysData);
			setRedirectsLast30Days(redirects30DaysData);
		} catch (error) {
			toast({
				title: "Erro",
				description: "Erro ao carregar dados",
				variant: "error",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast({
				title: "Copiado!",
				description: "Link copiado para a área de transferência",
			});
		} catch (error) {
			toast({
				title: "Erro",
				description: "Erro ao copiar link",
				variant: "error",
			});
		}
	};

	const generateSlug = (name: string) => {
		return name
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");
	};

	const handleCreateMasterCategory = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await createMasterCategory(newMasterCategory);
			toast({ title: "Sucesso", description: "Categoria master criada com sucesso!" });
			setNewMasterCategory({ name: "", slug: "" });
			setIsMasterCategoryDialogOpen(false);
			fetchData();
		} catch (error) {
			toast({ title: "Erro", description: "Erro ao criar categoria master", variant: "error" });
		}
	};

	const handleCreateCategory = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await createCategory(newCategory);
			toast({ title: "Sucesso", description: "Categoria criada com sucesso!" });
			setNewCategory({ name: "", slug: "", masterCategoryId: "" });
			setIsCategoryDialogOpen(false);
			fetchData();
		} catch (error) {
			toast({ title: "Erro", description: "Erro ao criar categoria", variant: "error" });
		}
	};

	const handleCreateSubcategory = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await createSubcategory(newSubcategory);
			toast({ title: "Sucesso", description: "Subcategoria criada com sucesso!" });
			setNewSubcategory({ name: "", slug: "", categoryId: "" });
			setIsSubcategoryDialogOpen(false);
			fetchData();
		} catch (error) {
			toast({ title: "Erro", description: "Erro ao criar subcategoria", variant: "error" });
		}
	};

	const handleCreateLink = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			await createLink(newLink);
			toast({ title: "Sucesso", description: "Link criado com sucesso!" });
			setNewLink({ url: "", subcategoryId: "" });
			setIsLinkDialogOpen(false);
			fetchData();
		} catch (error) {
			toast({ title: "Erro", description: "Erro ao criar link", variant: "error" });
		}
	};

	const handleEditClick = (link: Link) => {
		setSelectedLink(link);
		setEditedLinkUrl(link.url);
		setIsEditDialogOpen(true);
	};

	const handleDeleteClick = (link: Link) => {
		setSelectedLink(link);
		setIsDeleteDialogOpen(true);
	};

	const confirmEditLink = async (e: React.FormEvent) => {
		e.preventDefault();
		if (selectedLink && editedLinkUrl) {
			try {
				await updateLink(selectedLink.id, editedLinkUrl);
				toast({ title: "Sucesso", description: "Link atualizado com sucesso!" });
				setIsEditDialogOpen(false);
				fetchData();
			} catch (error) {
				toast({ title: "Erro", description: "Erro ao atualizar link", variant: "error" });
			}
		}
	};

	const confirmDeleteLink = async () => {
		if (selectedLink) {
			try {
				await deleteLink(selectedLink.id);
				toast({ title: "Sucesso", description: "Link excluído com sucesso!" });
				setIsDeleteDialogOpen(false);
				fetchData();
			} catch (error) {
				toast({ title: "Erro", description: "Erro ao excluir link", variant: "error" });
			}
		}
	};

	// Bitly Link Handlers
	const handleEditBitlyClick = (subcategory: Subcategory) => {
		setSelectedSubcategoryForBitly(subcategory);
		setEditedBitlyUrl(subcategory.bitlyUrl || "");
		setIsBitlyEditDialogOpen(true);
	};

	const handleDeleteBitlyClick = (subcategory: Subcategory) => {
		setSelectedSubcategoryForBitly(subcategory);
		setIsBitlyDeleteDialogOpen(true);
	};

	const confirmEditBitlyLink = async (e: React.FormEvent) => {
		e.preventDefault();
		if (selectedSubcategoryForBitly) {
			try {
				await updateSubcategoryBitlyUrl(selectedSubcategoryForBitly.id, editedBitlyUrl);
				toast({ title: "Sucesso", description: "Link Bitly atualizado com sucesso!" });
				setIsBitlyEditDialogOpen(false);
				fetchData();
			} catch (error) {
				toast({ title: "Erro", description: "Erro ao atualizar link Bitly", variant: "error" });
			}
		}
	};

	const confirmDeleteBitlyLink = async () => {
		if (selectedSubcategoryForBitly) {
			try {
				await deleteSubcategoryBitlyUrl(selectedSubcategoryForBitly.id);
				toast({ title: "Sucesso", description: "Link Bitly excluído com sucesso!" });
				setIsBitlyDeleteDialogOpen(false);
				fetchData();
			} catch (error) {
				toast({ title: "Erro", description: "Erro ao excluir link Bitly", variant: "error" });
			}
		}
	};

	const getFullRedirectLink = (subcategoryId: string) => {
		return `${window.location.origin}/link?id=${subcategoryId}`;
	};

	// Pagination logic
	const indexOfLastLink = currentPage * linksPerPage;
	const indexOfFirstLink = indexOfLastLink - linksPerPage;
	const currentLinks = links.slice(indexOfFirstLink, indexOfLastLink);
	const totalPages = Math.ceil(links.length / linksPerPage);

	const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-gray-900"></div>
			</div>
		);
	}

	return (
		<div className="flex h-screen bg-background">
			<AdminSidebar
				onCreateMasterCategory={() => setIsMasterCategoryDialogOpen(true)}
				onCreateCategory={() => setIsCategoryDialogOpen(true)}
				onCreateSubcategory={() => setIsSubcategoryDialogOpen(true)}
				onCreateLink={() => setIsLinkDialogOpen(true)}
			/>
			<div className="flex-1 flex flex-col overflow-hidden md:ml-0">
				<main className="flex-1 overflow-x-hidden overflow-y-auto bg-background p-4 md:p-6">
					<div className="space-y-6">
						<div>
							<h1 className="text-2xl md:text-3xl font-bold tracking-tight">Visão Geral</h1>
							<p className="text-muted-foreground">
								Gerencie seus links de afiliados e acompanhe as estatísticas
							</p>
						</div>

						{/* Stats Cards */}
						<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
							<Card>
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<CardTitle className="text-sm font-medium">Total Redirects</CardTitle>
									<RefreshCcw className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">{totalRedirects}</div>
									<p className="text-xs text-muted-foreground">
										Total de cliques em links de afiliados
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<CardTitle className="text-sm font-medium">Redirects (7 dias)</CardTitle>
									<RefreshCcw className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">{redirectsLast7Days}</div>
									<p className="text-xs text-muted-foreground">Cliques nos últimos 7 dias</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<CardTitle className="text-sm font-medium">Redirects (30 dias)</CardTitle>
									<RefreshCcw className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">{redirectsLast30Days}</div>
									<p className="text-xs text-muted-foreground">Cliques nos últimos 30 dias</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Total de Subcategorias</CardTitle>
									<div className="text-2xl font-bold">{subcategories.length}</div>
								</CardHeader>
							</Card>

							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium">Total de Links</CardTitle>
									<div className="text-2xl font-bold">{links.length}</div>
								</CardHeader>
							</Card>
						</div>

						{/* Detailed Categories Section with Accordion */}
						<Card>
							<CardHeader>
								<CardTitle>Estrutura Hierárquica Completa</CardTitle>
								<CardDescription>
									Navegue pela estrutura completa e acesse os links de afiliados
								</CardDescription>
							</CardHeader>
							<CardContent>
								{masterCategories.map((masterCategory) => (
									<Accordion type="single" collapsible key={masterCategory.id} className="w-full">
										<AccordionItem value={`master-${masterCategory.id}`}>
											<AccordionTrigger className="text-lg font-semibold">
												🏷️ {masterCategory.name} ({masterCategory.totalRedirects || 0} redirects)
											</AccordionTrigger>
											<AccordionContent>
												{masterCategory.categories?.map((category) => (
													<Accordion
														type="single"
														collapsible
														key={category.id}
														className="w-full pl-4"
													>
														<AccordionItem value={`category-${category.id}`}>
															<AccordionTrigger className="text-md font-medium">
																<div className="flex items-center gap-2">
																	{React.createElement(
																		categoryIcons[
																			category.slug as keyof typeof categoryIcons
																		] || Package,
																		{ className: "size-4" },
																	)}
																	{category.name} ({category.totalRedirects || 0}{" "}
																	redirects)
																</div>
															</AccordionTrigger>
															<AccordionContent>
																{category.subcategories?.map((subcategory) => (
																	<Accordion
																		type="single"
																		collapsible
																		key={subcategory.id}
																		className="w-full pl-4"
																	>
																		<AccordionItem
																			value={`subcategory-${subcategory.id}`}
																		>
																			<AccordionTrigger className="text-sm">
																				📂 {subcategory.name} (
																				{subcategory.totalRedirects || 0}{" "}
																				redirects)
																			</AccordionTrigger>
																			<AccordionContent className="grid gap-2">
																				{links
																					.filter(
																						(link) =>
																							link.subcategoryId ===
																							subcategory.id,
																					)
																					.map((link) => (
																						<div
																							key={link.id}
																							className="flex items-center justify-between p-2 border rounded-md bg-gray-50 dark:bg-gray-800"
																						>
																							<span className="truncate text-sm">
																								{link.url}
																							</span>
																							<div className="flex gap-2">
																								<Button
																									variant="outline"
																									size="sm"
																									onClick={() =>
																										copyToClipboard(
																											link.url,
																										)
																									}
																								>
																									<Copy className="h-3 w-3" />
																								</Button>
																								<Button
																									variant="outline"
																									size="sm"
																									onClick={() =>
																										window.open(
																											link.url,
																											"_blank",
																										)
																									}
																								>
																									<ExternalLink className="h-3 w-3" />
																								</Button>
																								<Button
																									variant="outline"
																									size="sm"
																									onClick={() =>
																										handleEditClick(
																											link,
																										)
																									}
																								>
																									<Edit className="h-3 w-3" />
																								</Button>
																								<Button
																									variant="outline"
																									size="sm"
																									onClick={() =>
																										handleDeleteClick(
																											link,
																										)
																									}
																								>
																									<Trash2 className="h-3 w-3" />
																								</Button>
																							</div>
																						</div>
																					))}
																				<div className="mt-4 p-3 border border-blue-300 bg-blue-50/50 rounded-md flex flex-col gap-2">
																					<p className="text-sm font-semibold text-blue-700 dark:text-white">
																						Link Final da Subcategoria (para
																						encurtar no Bitly):
																					</p>
																					<div className="flex items-center gap-2">
																						<Input
																							readOnly
																							value={getFullRedirectLink(
																								subcategory.id,
																							)}
																							className="flex-1 bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-200"
																						/>
																						<Button
																							variant="outline"
																							size="sm"
																							onClick={() =>
																								copyToClipboard(
																									getFullRedirectLink(
																										subcategory.id,
																									),
																								)
																							}
																						>
																							<Copy className="h-4 w-4" />
																						</Button>
																					</div>
																					<p className="text-xs text-blue-600 dark:text-blue-300">
																						Copie este link, encurte-o no
																						Bitly e use-o na internet. Ele
																						fará um redirecionamento
																						aleatório para um dos links
																						acima.
																					</p>
																				</div>

																				{/* Novo input para o link Bitly personalizado */}
																				<div className="mt-4 p-3 border border-purple-300 bg-purple-50/50 rounded-md flex flex-col gap-2">
																					<p className="text-sm font-semibold text-purple-700 dark:text-white">
																						Seu Link Bitly Personalizado
																						(Opcional):
																					</p>
																					<div className="flex items-center gap-2">
																						<Input
																							value={
																								subcategory.bitlyUrl ||
																								""
																							}
																							onChange={(e) => {
																								// Atualiza o estado local da subcategoria para refletir a mudança
																								setSubcategories(
																									(prev) =>
																										prev.map((s) =>
																											s.id ===
																											subcategory.id
																												? {
																														...s,
																														bitlyUrl:
																															e
																																.target
																																.value,
																													}
																												: s,
																										),
																								);
																							}}
																							placeholder="https://bit.ly/seu-link-personalizado"
																							className="flex-1 bg-purple-100 border-purple-400 text-purple-800 dark:bg-purple-950 dark:border-purple-700 dark:text-purple-200"
																						/>
																						<Button
																							variant="outline"
																							size="sm"
																							onClick={() =>
																								subcategory.bitlyUrl &&
																								copyToClipboard(
																									subcategory.bitlyUrl,
																								)
																							}
																							disabled={
																								!subcategory.bitlyUrl
																							}
																						>
																							<Copy className="h-4 w-4" />
																						</Button>
																						<Button
																							variant="outline"
																							size="sm"
																							onClick={() =>
																								subcategory.bitlyUrl &&
																								window.open(
																									subcategory.bitlyUrl,
																									"_blank",
																								)
																							}
																							disabled={
																								!subcategory.bitlyUrl
																							}
																						>
																							<ExternalLink className="h-4 w-4" />
																						</Button>
																						<Button
																							variant="outline"
																							size="sm"
																							onClick={() =>
																								handleEditBitlyClick(
																									subcategory,
																								)
																							}
																						>
																							<Edit className="h-4 w-4" />
																						</Button>
																						<Button
																							variant="outline"
																							size="sm"
																							onClick={() =>
																								handleDeleteBitlyClick(
																									subcategory,
																								)
																							}
																							disabled={
																								!subcategory.bitlyUrl
																							}
																						>
																							<Trash2 className="h-4 w-4" />
																						</Button>
																					</div>
																					<p className="text-xs text-purple-600 dark:text-purple-300">
																						Use este campo para salvar e
																						gerenciar o link encurtado do
																						Bitly que você criou para a URL
																						final desta subcategoria.
																					</p>
																				</div>
																			</AccordionContent>
																		</AccordionItem>
																	</Accordion>
																))}
															</AccordionContent>
														</AccordionItem>
													</Accordion>
												))}
											</AccordionContent>
										</AccordionItem>
									</Accordion>
								))}
							</CardContent>
						</Card>

						{/* Summary Tables */}
						<div className="grid gap-4 grid-cols-1">
							<Card>
								<CardHeader>
									<CardTitle>Links Mais Clicados</CardTitle>
									<CardDescription>Top links por número de cliques (paginado)</CardDescription>
								</CardHeader>
								<CardContent>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>URL</TableHead>
												<TableHead>Categoria</TableHead>
												<TableHead>Cliques</TableHead>
												<TableHead className="text-right">Ações</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{currentLinks
												.sort((a, b) => b.clicks - a.clicks) // Mantém a ordenação
												.map((link) => (
													<TableRow key={link.id}>
														<TableCell className="max-w-xs truncate">{link.url}</TableCell>
														<TableCell>
															{link.subcategory?.category.masterCategory.name} →{" "}
															{link.subcategory?.category.name} → {link.subcategory?.name}
														</TableCell>
														<TableCell>{link.clicks}</TableCell>
														<TableCell className="text-right">
															<div className="flex justify-end gap-2">
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => copyToClipboard(link.url)}
																	title="Copiar URL do Link"
																>
																	<Copy className="h-3 w-3" />
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => window.open(link.url, "_blank")}
																	title="Abrir Link"
																>
																	<ExternalLink className="h-3 w-3" />
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => handleEditClick(link)}
																	title="Editar Link"
																>
																	<Edit className="h-3 w-3" />
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => handleDeleteClick(link)}
																	title="Excluir Link"
																>
																	<Trash2 className="h-3 w-3" />
																</Button>
															</div>
														</TableCell>
													</TableRow>
												))}
										</TableBody>
									</Table>
									<div className="flex justify-center items-center gap-4 mt-4">
										<Button
											variant="outline"
											size="sm"
											onClick={() => paginate(currentPage - 1)}
											disabled={currentPage === 1}
										>
											<ChevronLeft className="h-4 w-4" /> Anterior
										</Button>
										<span className="text-sm text-muted-foreground">
											Página {currentPage} de {totalPages}
										</span>
										<Button
											variant="outline"
											size="sm"
											onClick={() => paginate(currentPage + 1)}
											disabled={currentPage === totalPages}
										>
											Próxima <ChevronRight className="h-4 w-4" />
										</Button>
									</div>
								</CardContent>
							</Card>
						</div>
					</div>
				</main>
			</div>

			{/* Dialogs */}
			<Dialog open={isMasterCategoryDialogOpen} onOpenChange={setIsMasterCategoryDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Criar Nova Categoria Master</DialogTitle>
						<DialogDescription>Adicione uma nova categoria master (Físico ou Digital)</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleCreateMasterCategory} className="space-y-4">
						<div>
							<Label htmlFor="masterCategoryName">Nome da Categoria Master</Label>
							<Input
								id="masterCategoryName"
								value={newMasterCategory.name}
								onChange={(e) => {
									const name = e.target.value;
									setNewMasterCategory({
										name,
										slug: generateSlug(name),
									});
								}}
								placeholder="Ex: Físico"
								required
							/>
						</div>
						<div>
							<Label htmlFor="masterCategorySlug">Slug</Label>
							<Input
								id="masterCategorySlug"
								value={newMasterCategory.slug}
								onChange={(e) => setNewMasterCategory({ ...newMasterCategory, slug: e.target.value })}
								placeholder="fisico"
								required
							/>
						</div>
						<Button type="submit" className="w-full">
							Criar Categoria Master
						</Button>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Criar Nova Categoria</DialogTitle>
						<DialogDescription>Adicione uma nova categoria a uma categoria master</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleCreateCategory} className="space-y-4">
						<div>
							<Label htmlFor="categoryMaster">Categoria Master</Label>
							<Select
								value={newCategory.masterCategoryId}
								onValueChange={(value) => setNewCategory({ ...newCategory, masterCategoryId: value })}
								required
							>
								<SelectTrigger>
									<SelectValue placeholder="Selecione uma categoria master" />
								</SelectTrigger>
								<SelectContent>
									{masterCategories.map((masterCategory) => (
										<SelectItem key={masterCategory.id} value={masterCategory.id}>
											{masterCategory.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<Label htmlFor="categoryName">Nome da Categoria</Label>
							<Input
								id="categoryName"
								value={newCategory.name}
								onChange={(e) => {
									const name = e.target.value;
									setNewCategory({
										...newCategory,
										name,
										slug: generateSlug(name),
									});
								}}
								placeholder="Ex: Produtos para Casa"
								required
							/>
						</div>
						<div>
							<Label htmlFor="categorySlug">Slug</Label>
							<Input
								id="categorySlug"
								value={newCategory.slug}
								onChange={(e) => setNewCategory({ ...newCategory, slug: e.target.value })}
								placeholder="produtos-casa"
								required
							/>
						</div>
						<Button type="submit" className="w-full">
							Criar Categoria
						</Button>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={isSubcategoryDialogOpen} onOpenChange={setIsSubcategoryDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Criar Nova Subcategoria</DialogTitle>
						<DialogDescription>Adicione uma subcategoria a uma categoria existente</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleCreateSubcategory} className="space-y-4">
						<div>
							<Label htmlFor="subcategoryCategory">Categoria</Label>
							<Select
								value={newSubcategory.categoryId}
								onValueChange={(value) => setNewSubcategory({ ...newSubcategory, categoryId: value })}
								required
							>
								<SelectTrigger>
									<SelectValue placeholder="Selecione uma categoria" />
								</SelectTrigger>
								<SelectContent>
									{categories.map((category) => (
										<SelectItem key={category.id} value={category.id}>
											{category.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<Label htmlFor="subcategoryName">Nome da Subcategoria</Label>
							<Input
								id="subcategoryName"
								value={newSubcategory.name}
								onChange={(e) => {
									const name = e.target.value;
									setNewSubcategory({
										...newSubcategory,
										name,
										slug: generateSlug(name),
									});
								}}
								placeholder="Ex: Low Ticket"
								required
							/>
						</div>
						<div>
							<Label htmlFor="subcategorySlug">Slug</Label>
							<Input
								id="subcategorySlug"
								value={newSubcategory.slug}
								onChange={(e) => setNewSubcategory({ ...newSubcategory, slug: e.target.value })}
								placeholder="low-ticket"
								required
							/>
						</div>
						<Button type="submit" className="w-full">
							Criar Subcategoria
						</Button>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Adicionar Novo Link</DialogTitle>
						<DialogDescription>Adicione um novo link de afiliado a uma subcategoria</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleCreateLink} className="space-y-4">
						<div>
							<Label htmlFor="linkUrl">URL do Link</Label>
							<Input
								id="linkUrl"
								type="url"
								value={newLink.url}
								onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
								placeholder="https://exemplo.com/affiliate-link"
								required
							/>
						</div>
						<div>
							<Label htmlFor="linkSubcategory">Subcategoria</Label>
							<Select
								value={newLink.subcategoryId}
								onValueChange={(value) => setNewLink({ ...newLink, subcategoryId: value })}
								required
							>
								<SelectTrigger>
									<SelectValue placeholder="Selecione uma subcategoria" />
								</SelectTrigger>
								<SelectContent>
									{categories.map((category) =>
										category.subcategories?.map((subcategory) => (
											<SelectItem key={subcategory.id} value={subcategory.id}>
												{category.name} - {subcategory.name}
											</SelectItem>
										)),
									)}
								</SelectContent>
							</Select>
						</div>
						<Button type="submit" className="w-full">
							Adicionar Link
						</Button>
					</form>
				</DialogContent>
			</Dialog>

			{/* Edit Link Dialog */}
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Editar Link</DialogTitle>
						<DialogDescription>Atualize a URL do link selecionado.</DialogDescription>
					</DialogHeader>
					<form onSubmit={confirmEditLink} className="space-y-4">
						<div>
							<Label htmlFor="editLinkUrl">Nova URL do Link</Label>
							<Input
								id="editLinkUrl"
								type="url"
								value={editedLinkUrl}
								onChange={(e) => setEditedLinkUrl(e.target.value)}
								required
							/>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
								Cancelar
							</Button>
							<Button type="submit">Confirmar Edição</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Delete Link Dialog */}
			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirmar Exclusão</DialogTitle>
						<DialogDescription>
							Tem certeza que deseja excluir o link:{" "}
							<span className="font-semibold">{selectedLink?.url}</span>? Esta ação não pode ser desfeita.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
							Cancelar
						</Button>
						<Button type="button" variant="destructive" onClick={confirmDeleteLink}>
							Excluir
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Edit Bitly Link Dialog (Novo) */}
			<Dialog open={isBitlyEditDialogOpen} onOpenChange={setIsBitlyEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Editar Link Bitly Personalizado</DialogTitle>
						<DialogDescription>
							Atualize o link Bitly para a subcategoria:{" "}
							<span className="font-semibold">{selectedSubcategoryForBitly?.name}</span>
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={confirmEditBitlyLink} className="space-y-4">
						<div>
							<Label htmlFor="editBitlyUrl">Novo Link Bitly</Label>
							<Input
								id="editBitlyUrl"
								type="url"
								value={editedBitlyUrl}
								onChange={(e) => setEditedBitlyUrl(e.target.value)}
								placeholder="https://bit.ly/seu-novo-link"
							/>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setIsBitlyEditDialogOpen(false)}>
								Cancelar
							</Button>
							<Button type="submit">Salvar Link Bitly</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Delete Bitly Link Dialog (Novo) */}
			<Dialog open={isBitlyDeleteDialogOpen} onOpenChange={setIsBitlyDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirmar Exclusão do Link Bitly</DialogTitle>
						<DialogDescription>
							Tem certeza que deseja remover o link Bitly personalizado para a subcategoria:{" "}
							<span className="font-semibold">{selectedSubcategoryForBitly?.name}</span>?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setIsBitlyDeleteDialogOpen(false)}>
							Cancelar
						</Button>
						<Button type="button" variant="destructive" onClick={confirmDeleteBitlyLink}>
							Remover Link Bitly
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
