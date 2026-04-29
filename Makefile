all: report.pdf

report.pdf: report.tex
	pdflatex report
	pdflatex report

clean:
	rm -f *.aux *.bbl *.bcf *.blg *.log *.out *.run.xml *.toc *.lof *.lot *.bib
	
.PHONY: clean
